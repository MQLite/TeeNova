import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/lib/api-client'
import { makeOrdersApi } from './orders'
import { buildOrderItemPayloads, draftQuoteSignature } from '@/features/checkout/order-item-payload'
import type { CartItem, OnlinePaymentQuote } from '@/types'

const MONETARY_KEYS = [
  'price',
  'unitprice',
  'subtotal',
  'total',
  'amount',
  'baseamount',
  'surcharge',
  'surchargeamount',
  'chargedamount',
  'fee',
  'fixedfee',
  'basispoints',
  'providermode',
  'calculationversion',
  'linetotal',
]

/** Recursively asserts that a request body carries no monetary or configuration authority. */
function assertNoMonetaryAuthority(payload: unknown, path = 'body') {
  if (Array.isArray(payload)) {
    payload.forEach((entry, index) => assertNoMonetaryAuthority(entry, `${path}[${index}]`))
    return
  }
  if (payload === null || typeof payload !== 'object') return

  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    expect(
      MONETARY_KEYS.includes(key.toLowerCase()),
      `${path}.${key} must not be submitted by the browser`,
    ).toBe(false)
    assertNoMonetaryAuthority(value, `${path}.${key}`)
  }
}

function makeClient() {
  const post = vi.fn().mockResolvedValue({})
  const client = {
    get: vi.fn(),
    post,
    put: vi.fn(),
    delete: vi.fn(),
    uploadFile: vi.fn(),
  } as unknown as ApiClient
  return { client, post }
}

const garmentItem: CartItem = {
  cartItemKey: 'key-1',
  productId: 'prod-1',
  productVariantId: 'var-1',
  productName: 'Tee',
  variantLabel: 'Black / M',
  quantity: 2,
  unitPrice: 25,
  prints: [
    {
      printAreaId: 'area-1',
      printAreaName: 'Front',
      printSizeId: 'size-1',
      printSizeName: 'A4',
      printAreaPrice: 0,
      printSizePrice: 0,
      uploadedAssetUrl: '/uploads/design.png',
    },
  ],
} as unknown as CartItem

const badgeItem: CartItem = {
  cartItemKey: 'key-2',
  kind: 'Badge',
  productId: 'prod-2',
  productName: 'Badge',
  quantity: 10,
  unitPrice: 2,
  uploadedAssetUrl: '/uploads/badge.png',
} as unknown as CartItem

describe('draft online payment quote', () => {
  it('posts to the draft quote route', async () => {
    const { client, post } = makeClient()

    await makeOrdersApi(client).getDraftOnlinePaymentQuote({
      provider: 'Stripe',
      deliveryMethod: 'Pickup',
      items: buildOrderItemPayloads([garmentItem]),
    })

    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0]).toBe('/api/orders/online-payment-quote')
  })

  it('sends only provider, delivery method and price-free items', async () => {
    const { client, post } = makeClient()

    await makeOrdersApi(client).getDraftOnlinePaymentQuote({
      provider: 'Stripe',
      deliveryMethod: 'Shipping',
      items: buildOrderItemPayloads([garmentItem, badgeItem]),
    })

    const body = post.mock.calls[0][1] as Record<string, unknown>

    expect(Object.keys(body).sort()).toEqual(['deliveryMethod', 'items', 'provider'])
    assertNoMonetaryAuthority(body)
  })

  it('uses the same price-free item shape as order creation', () => {
    const payloads = buildOrderItemPayloads([garmentItem, badgeItem])

    expect(payloads[0]).toEqual({
      productId: 'prod-1',
      productVariantId: 'var-1',
      quantity: 2,
      prints: [
        {
          printAreaId: 'area-1',
          printSizeId: 'size-1',
          uploadedAssetId: undefined,
          uploadedAssetUrl: '/uploads/design.png',
          designNote: undefined,
        },
      ],
    })

    expect(payloads[1]).toEqual({
      productId: 'prod-2',
      quantity: 10,
      uploadedAssetId: undefined,
      uploadedAssetUrl: '/uploads/badge.png',
      designNote: undefined,
    })

    assertNoMonetaryAuthority(payloads)
  })
})

describe('existing-order online payment quote', () => {
  it('posts to the existing-order quote route', async () => {
    const { client, post } = makeClient()

    await makeOrdersApi(client).getExistingOrderOnlinePaymentQuote('order-9', { provider: 'Stripe' })

    expect(post.mock.calls[0][0]).toBe('/api/orders/order-9/online-payment-quote')
  })

  it('sends only the provider and optional purpose', async () => {
    const { client, post } = makeClient()

    await makeOrdersApi(client).getExistingOrderOnlinePaymentQuote('order-9', {
      provider: 'Stripe',
      purpose: 'Deposit',
    })

    const body = post.mock.calls[0][1] as Record<string, unknown>

    expect(body).toEqual({ provider: 'Stripe', purpose: 'Deposit' })
    assertNoMonetaryAuthority(body)
  })
})

describe('payment session creation', () => {
  it('adds only the quote fingerprint to the existing request', async () => {
    const { client, post } = makeClient()

    await makeOrdersApi(client).createOnlinePaymentSession('order-9', {
      provider: 'Stripe',
      paymentQuoteFingerprint: 'fingerprint-abc',
    })

    expect(post.mock.calls[0][0]).toBe('/api/orders/order-9/online-payment-session')
    expect(post.mock.calls[0][1]).toEqual({
      provider: 'Stripe',
      paymentQuoteFingerprint: 'fingerprint-abc',
    })
    assertNoMonetaryAuthority(post.mock.calls[0][1])
  })

  it('still works with no fingerprint (surcharge disabled)', async () => {
    const { client, post } = makeClient()

    await makeOrdersApi(client).createOnlinePaymentSession('order-9', { provider: 'Stripe' })

    expect(post.mock.calls[0][1]).toEqual({ provider: 'Stripe' })
  })
})

describe('quote response mapping', () => {
  it('surfaces the safe backend fields unchanged', async () => {
    const payload: OnlinePaymentQuote = {
      provider: 'Stripe',
      currency: 'NZD',
      purpose: 'Deposit',
      baseAmount: 100,
      surchargeEnabled: true,
      surchargeAmount: 3.04,
      chargedAmount: 103.04,
      surchargeDisclosureText: 'A card processing surcharge applies to online card payments.',
      surchargePercentageBasisPoints: 265,
      surchargeFixedAmount: 0.3,
      calculationVersion: 'stripe-gross-up-v1',
      quoteFingerprint: 'fingerprint-abc',
    }

    const { client, post } = makeClient()
    post.mockResolvedValueOnce(payload)

    const quote = await makeOrdersApi(client).getExistingOrderOnlinePaymentQuote('order-9', {
      provider: 'Stripe',
    })

    expect(quote).toEqual(payload)
    expect(quote.chargedAmount).toBe(103.04)
    expect(Object.keys(quote)).not.toContain('providerMode')
    expect(Object.keys(quote)).not.toContain('secretKey')
  })
})

describe('draftQuoteSignature', () => {
  it('changes when the quantity changes', () => {
    const changed = { ...garmentItem, quantity: 3 } as CartItem

    expect(draftQuoteSignature([garmentItem], 'Pickup', 'Stripe')).not.toBe(
      draftQuoteSignature([changed], 'Pickup', 'Stripe'),
    )
  })

  it('changes when the delivery method changes', () => {
    expect(draftQuoteSignature([garmentItem], 'Pickup', 'Stripe')).not.toBe(
      draftQuoteSignature([garmentItem], 'Shipping', 'Stripe'),
    )
  })

  it('changes when the provider changes', () => {
    expect(draftQuoteSignature([garmentItem], 'Pickup', 'Stripe')).not.toBe(
      draftQuoteSignature([garmentItem], 'Pickup', 'PayPal'),
    )
  })

  it('changes when an item is added or a print selection changes', () => {
    const baseline = draftQuoteSignature([garmentItem], 'Pickup', 'Stripe')

    expect(draftQuoteSignature([garmentItem, badgeItem], 'Pickup', 'Stripe')).not.toBe(baseline)

    const reprinted = {
      ...garmentItem,
      prints: [{ ...garmentItem.prints![0], printSizeId: 'size-2' }],
    } as CartItem
    expect(draftQuoteSignature([reprinted], 'Pickup', 'Stripe')).not.toBe(baseline)
  })

  it('is stable for identical carts', () => {
    expect(draftQuoteSignature([garmentItem, badgeItem], 'Pickup', 'Stripe')).toBe(
      draftQuoteSignature([garmentItem, badgeItem], 'Pickup', 'Stripe'),
    )
  })
})
