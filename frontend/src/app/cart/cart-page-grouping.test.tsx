import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CartPage from './page'
import { useCartStore } from '@/features/cart/cart-store'
import { buildOrderItemPayloads } from '@/features/checkout/order-item-payload'
import type { CartItem, PriceCalculationRequest, PriceCalculationResponse } from '@/types'

/**
 * Page-level proof for Jira 10102: the REAL cart store and the REAL useCartPricing hook drive the
 * grouped page; only the HTTP layer is mocked. Confirms the product grouping, the exact per-row
 * mutation identity, the repriced subtotal and the untouched checkout payload.
 */

const calculatePricing = vi.fn<(request: PriceCalculationRequest) => Promise<PriceCalculationResponse>>()

vi.mock('@/api/pricing', () => ({
  pricingApi: {
    calculatePricing: (request: PriceCalculationRequest) => calculatePricing(request),
  },
}))

vi.mock('@/api/catalog', () => ({
  catalogApi: {
    getProduct: vi.fn().mockRejectedValue(new Error('catalog must not be needed for fresh cart lines')),
  },
}))

const TEE = 'prod-tee-1'
const TEE_TWIN = 'prod-tee-2'

function quote(unitPrice: number, quantity: number): PriceCalculationResponse {
  return {
    productBasePrice: unitPrice,
    variantAdjustment: 0,
    printAddOns: [],
    garmentUnitPrice: unitPrice,
    printUnitPrice: 0,
    unitPrice,
    quantity,
    lineTotal: unitPrice * quantity,
    currency: 'NZD',
    pricingMode: 'Additive',
    appliedTierMinQuantity: null,
    appliedTierUnitPrice: null,
    nextTierMinQuantity: null,
    nextTierUnitPrice: null,
    includedStandardPrintAmount: 0,
  }
}

const frontOnly: CartItem = {
  cartItemKey: 'front-only',
  productId: TEE,
  productVariantId: 'variant-black-m',
  productName: 'Staple Tee',
  variantLabel: 'Black / M',
  color: 'Black',
  size: 'M',
  unitPrice: 30,
  quantity: 2,
  printPricingGroupId: null,
  prints: [{ printAreaId: 'a-front', printAreaName: 'Front', printSizeId: 's-a3', printSizeName: 'A3' }],
}

const frontAndBack: CartItem = {
  ...frontOnly,
  cartItemKey: 'front-and-back',
  unitPrice: 38,
  quantity: 3,
  prints: [
    { printAreaId: 'a-front', printAreaName: 'Front', printSizeId: 's-a3', printSizeName: 'A3' },
    { printAreaId: 'a-back', printAreaName: 'Back', printSizeId: 's-a4', printSizeName: 'A4' },
  ],
}

// Same product NAME, different product id — must never merge into one group.
const twin: CartItem = {
  ...frontOnly,
  cartItemKey: 'twin',
  productId: TEE_TWIN,
  productVariantId: 'variant-white-l',
  variantLabel: 'White / L',
  color: 'White',
  size: 'L',
  quantity: 1,
}

const cart = [frontOnly, frontAndBack, twin]

/** Fresh quotes deliberately differ from the persisted unitPrice so a stale read would be visible. */
const freshUnitPrice: Record<string, number> = {
  'front-only': 27.5,
  'front-and-back': 35,
  twin: 26,
}

beforeEach(() => {
  useCartStore.setState({ items: structuredClone(cart) })
  calculatePricing.mockImplementation((request) => {
    const item = useCartStore
      .getState()
      .items.find((i) => i.productId === request.productId && i.prints?.length === request.prints?.length)
    const key = item?.cartItemKey ?? 'front-only'
    return Promise.resolve(quote(freshUnitPrice[key], request.quantity))
  })
})

function groupCards() {
  return screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
}

describe('cart page — product-grouped presentation', () => {
  it('renders one group per product identity and never merges same-named products', async () => {
    render(<CartPage />)

    await waitFor(() => expect(screen.getAllByText(/Total quantity:/)).toHaveLength(2))

    expect(groupCards()).toEqual(['Staple Tee', 'Staple Tee'])
    expect(screen.getByText('Total quantity: 5')).toBeInTheDocument() // 2 + 3 under the first product
    expect(screen.getByText('Total quantity: 1')).toBeInTheDocument() // the same-named twin product
  })

  it('renders one child row per source cart line', async () => {
    render(<CartPage />)

    await waitFor(() => expect(screen.getByTestId('cart-row-front-only')).toBeInTheDocument())
    expect(screen.getByTestId('cart-row-front-and-back')).toBeInTheDocument()
    expect(screen.getByTestId('cart-row-twin')).toBeInTheDocument()
  })

  it('increases only the clicked line, leaving the same colour/size neighbour untouched', async () => {
    const user = userEvent.setup()
    render(<CartPage />)

    await waitFor(() => expect(screen.getByTestId('cart-row-front-and-back')).toBeInTheDocument())
    await user.click(
      within(screen.getByTestId('cart-row-front-and-back')).getByRole('button', { name: /increase quantity/i }),
    )

    const items = useCartStore.getState().items
    expect(items.find((i) => i.cartItemKey === 'front-and-back')?.quantity).toBe(4)
    expect(items.find((i) => i.cartItemKey === 'front-only')?.quantity).toBe(2)
    expect(items).toHaveLength(3)
  })

  it('deletes only the clicked line and drops the group when its last row goes', async () => {
    const user = userEvent.setup()
    render(<CartPage />)

    await waitFor(() => expect(screen.getByTestId('cart-row-twin')).toBeInTheDocument())
    await user.click(within(screen.getByTestId('cart-row-twin')).getByRole('button', { name: /^remove/i }))

    await waitFor(() => expect(screen.queryByTestId('cart-row-twin')).not.toBeInTheDocument())
    expect(useCartStore.getState().items.map((i) => i.cartItemKey)).toEqual(['front-only', 'front-and-back'])
    expect(screen.getAllByText(/Total quantity:/)).toHaveLength(1)
    expect(screen.getByTestId('cart-row-front-only')).toBeInTheDocument()
  })

  it('shows the repriced subtotal, matching the sum of the displayed line totals', async () => {
    render(<CartPage />)

    // 27.50×2 + 35×3 + 26×1 = 186.00 (persisted prices would give 30×2 + 38×3 + 30×1 = 204.00)
    await waitFor(() => expect(screen.getAllByText('$186.00').length).toBeGreaterThan(0))
    expect(screen.queryByText('$204.00')).not.toBeInTheDocument()
    // Line totals, scoped to their own row (the same figure can also appear in that row's breakdown).
    const lineTotals: Array<[string, string]> = [
      ['cart-row-front-only', '$55.00'],
      ['cart-row-front-and-back', '$105.00'],
      ['cart-row-twin', '$26.00'],
    ]
    for (const [testId, amount] of lineTotals) {
      expect(within(screen.getByTestId(testId)).getAllByText(amount).length).toBeGreaterThan(0)
    }
  })

  it('leaves the persisted cart order and the checkout payload untouched by the grouped view', async () => {
    const before = buildOrderItemPayloads(useCartStore.getState().items)

    render(<CartPage />)
    await waitFor(() => expect(screen.getByTestId('cart-row-twin')).toBeInTheDocument())

    const after = buildOrderItemPayloads(useCartStore.getState().items)
    expect(after).toEqual(before)
    expect(useCartStore.getState().items.map((i) => i.cartItemKey)).toEqual([
      'front-only',
      'front-and-back',
      'twin',
    ])
  })

  it('keeps the empty-cart state', () => {
    useCartStore.setState({ items: [] })
    render(<CartPage />)

    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse Products' })).toBeInTheDocument()
  })
})
