import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CheckoutPage from './page'
import { ApiError } from '@/lib/api-client'
import type { CartItem, OnlinePaymentQuote } from '@/types'

const getDraftOnlinePaymentQuote = vi.fn()
const createOnlinePaymentSession = vi.fn()
const createOrder = vi.fn()
const clearCart = vi.fn()
const routerPush = vi.fn()
const routerReplace = vi.fn()

let cartItems: CartItem[] = []

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}))

vi.mock('@/features/cart/cart-store', () => ({
  useCartStore: () => ({ items: cartItems, clearCart }),
}))

vi.mock('@/features/cart/useCartPricing', () => ({
  useCartPricing: () => ({
    pricingByKey: {},
    errorsByKey: {},
    groupKeyByItemKey: {},
    groupTotals: {},
    loading: false,
    isComplete: true,
    subtotal: 100,
    error: null,
  }),
}))

vi.mock('@/api/orders', () => ({
  ordersApi: {
    create: (...args: unknown[]) => createOrder(...args),
    getDraftOnlinePaymentQuote: (...args: unknown[]) => getDraftOnlinePaymentQuote(...args),
    createOnlinePaymentSession: (...args: unknown[]) => createOnlinePaymentSession(...args),
  },
}))

const garmentItem = {
  cartItemKey: 'key-1',
  productId: 'prod-1',
  productVariantId: 'var-1',
  productName: 'Tee',
  variantLabel: 'Black / M',
  quantity: 2,
  unitPrice: 50,
  prints: [],
} as unknown as CartItem

const canonicalQuote: OnlinePaymentQuote = {
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

function businessError(code: string): ApiError {
  return new ApiError(403, 'blocked', { error: { code: `TeeNova:Payment:${code}` } })
}

/** The single submit button, whatever its current phase label. */
function submitButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (!button) throw new Error('No submit button rendered')
  return button
}

async function selectOnlinePayment() {
  await userEvent.click(screen.getByRole('radio', { name: /Online Payment/ }))
}

/**
 * The checkout `Field` helper renders its <label> as a sibling with no htmlFor, so fields are addressed
 * by their name attribute here. (Recorded as a pre-existing accessibility finding in the Phase 4 report;
 * fixing every checkout field is outside this phase's scope.)
 */
function fieldByName(name: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  if (!input) throw new Error(`No checkout field named "${name}"`)
  return input
}

async function fillRequiredFields() {
  await userEvent.type(fieldByName('email'), 'buyer@example.test')
  await userEvent.type(fieldByName('fullName'), 'Jane Smith')
  await userEvent.type(fieldByName('addressLine1'), '123 Main Street')
  await userEvent.type(fieldByName('city'), 'Auckland')
  await userEvent.type(fieldByName('postalCode'), '1010')
}

beforeEach(() => {
  cartItems = [garmentItem]
  getDraftOnlinePaymentQuote.mockReset().mockResolvedValue(canonicalQuote)
  createOnlinePaymentSession.mockReset().mockResolvedValue({
    providerCheckoutUrl: 'https://checkout.stripe.test/c/session',
  })
  createOrder.mockReset().mockResolvedValue({ id: 'order-77' })
  clearCart.mockReset()
  routerPush.mockReset()
  Object.defineProperty(window, 'location', { configurable: true, value: { href: '' } })
})

describe('checkout page — quote fetching', () => {
  it('does not request a Stripe quote for manual payment', async () => {
    render(<CheckoutPage />)

    await waitFor(() => expect(screen.getByText('Order Summary')).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(getDraftOnlinePaymentQuote).not.toHaveBeenCalled()
    expect(screen.queryByText('Card processing surcharge')).not.toBeInTheDocument()
  })

  it('requests a draft quote when online Stripe payment is selected', async () => {
    render(<CheckoutPage />)
    await selectOnlinePayment()

    await waitFor(() => expect(getDraftOnlinePaymentQuote).toHaveBeenCalledTimes(1))
    expect(getDraftOnlinePaymentQuote).toHaveBeenCalledWith({
      provider: 'Stripe',
      deliveryMethod: 'Pickup',
      items: [
        {
          productId: 'prod-1',
          productVariantId: 'var-1',
          quantity: 2,
          prints: [],
        },
      ],
    })
  })

  it('displays the canonical breakdown and disclosure', async () => {
    render(<CheckoutPage />)
    await selectOnlinePayment()

    expect(await screen.findByText('Card processing surcharge')).toBeInTheDocument()
    expect(screen.getByText('NZ$100.00')).toBeInTheDocument()
    expect(screen.getByText('NZ$3.04')).toBeInTheDocument()
    expect(screen.getByText('NZ$103.04')).toBeInTheDocument()
    expect(screen.getByText(canonicalQuote.surchargeDisclosureText!)).toBeVisible()
  })

  it('puts the charged total on the submit button', async () => {
    render(<CheckoutPage />)
    await selectOnlinePayment()

    await waitFor(() =>
      expect(submitButton()).toHaveAccessibleName('Place order and pay NZ$103.04'),
    )
  })

  it('does not request a Stripe surcharge quote for another provider', async () => {
    render(<CheckoutPage />)
    await selectOnlinePayment()
    await waitFor(() => expect(getDraftOnlinePaymentQuote).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole('radio', { name: 'PayPal' }))

    await waitFor(() => expect(screen.queryByText('Card processing surcharge')).not.toBeInTheDocument())
    expect(getDraftOnlinePaymentQuote).toHaveBeenCalledTimes(1)
  })

  it('clears the quote when switching back to manual and refetches on returning to Stripe', async () => {
    render(<CheckoutPage />)
    await selectOnlinePayment()
    expect(await screen.findByText('Card processing surcharge')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: /Manual Payment/ }))
    await waitFor(() => expect(screen.queryByText('Card processing surcharge')).not.toBeInTheDocument())
    expect(submitButton()).toHaveTextContent('Place Order')

    await selectOnlinePayment()
    await waitFor(() => expect(getDraftOnlinePaymentQuote).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Card processing surcharge')).toBeInTheDocument()
  })

  it('refetches when the delivery method changes', async () => {
    render(<CheckoutPage />)
    await selectOnlinePayment()
    await waitFor(() => expect(getDraftOnlinePaymentQuote).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole('radio', { name: /Shipping/ }))

    await waitFor(() => expect(getDraftOnlinePaymentQuote).toHaveBeenCalledTimes(2))
    expect(getDraftOnlinePaymentQuote).toHaveBeenLastCalledWith(
      expect.objectContaining({ deliveryMethod: 'Shipping' }),
    )
  })

  it('disables submission while the quote is loading', async () => {
    let resolveQuote: ((quote: OnlinePaymentQuote) => void) | undefined
    getDraftOnlinePaymentQuote.mockReturnValue(
      new Promise<OnlinePaymentQuote>((resolve) => {
        resolveQuote = resolve
      }),
    )

    render(<CheckoutPage />)
    await selectOnlinePayment()

    expect(await screen.findByText('Calculating secure card payment total…')).toBeInTheDocument()
    expect(submitButton()).toBeDisabled()

    resolveQuote!(canonicalQuote)
    await waitFor(() => expect(submitButton()).toBeEnabled())
  })

  it('disables submission and alerts when the quote fails', async () => {
    getDraftOnlinePaymentQuote.mockRejectedValue(new Error('network down'))

    render(<CheckoutPage />)
    await selectOnlinePayment()

    await waitFor(() => expect(submitButton()).toBeDisabled())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t calculate the current card payment total',
    )
  })

  it('keeps the pre-surcharge checkout untouched when the surcharge is disabled', async () => {
    getDraftOnlinePaymentQuote.mockResolvedValue({
      ...canonicalQuote,
      surchargeEnabled: false,
      surchargeAmount: 0,
      chargedAmount: 100,
      surchargeDisclosureText: null,
      quoteFingerprint: '',
    })

    render(<CheckoutPage />)
    await selectOnlinePayment()

    await waitFor(() => expect(getDraftOnlinePaymentQuote).toHaveBeenCalled())
    await waitFor(() => expect(submitButton()).toBeEnabled())
    expect(screen.queryByText('Card processing surcharge')).not.toBeInTheDocument()
    expect(submitButton()).toHaveTextContent('Place Order & Continue to Payment')
  })
})

describe('checkout page — submission', () => {
  it('creates the order then the session with the displayed fingerprint', async () => {
    render(<CheckoutPage />)
    await selectOnlinePayment()
    await fillRequiredFields()
    await waitFor(() => expect(submitButton()).toBeEnabled())

    await userEvent.click(submitButton())

    await waitFor(() => expect(createOnlinePaymentSession).toHaveBeenCalledTimes(1))
    expect(createOnlinePaymentSession).toHaveBeenCalledWith('order-77', {
      provider: 'Stripe',
      paymentQuoteFingerprint: 'fingerprint-abc',
    })
  })

  it('submits no monetary value in either request', async () => {
    render(<CheckoutPage />)
    await selectOnlinePayment()
    await fillRequiredFields()
    await waitFor(() => expect(submitButton()).toBeEnabled())

    await userEvent.click(submitButton())
    await waitFor(() => expect(createOnlinePaymentSession).toHaveBeenCalled())

    const serialized = JSON.stringify([
      createOrder.mock.calls[0][0],
      createOnlinePaymentSession.mock.calls[0][1],
    ])

    for (const forbidden of ['103.04', '"amount"', 'surchargeAmount', 'chargedAmount', 'basisPoints', 'providerMode']) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('redirects only after a successful session', async () => {
    render(<CheckoutPage />)
    await selectOnlinePayment()
    await fillRequiredFields()
    await waitFor(() => expect(submitButton()).toBeEnabled())

    await userEvent.click(submitButton())

    await waitFor(() => expect(window.location.href).toBe('https://checkout.stripe.test/c/session'))
  })

  it('omits the fingerprint when the surcharge is disabled', async () => {
    getDraftOnlinePaymentQuote.mockResolvedValue({
      ...canonicalQuote,
      surchargeEnabled: false,
      surchargeAmount: 0,
      chargedAmount: 100,
      surchargeDisclosureText: null,
      quoteFingerprint: '',
    })

    render(<CheckoutPage />)
    await selectOnlinePayment()
    await fillRequiredFields()
    await waitFor(() => expect(submitButton()).toBeEnabled())

    await userEvent.click(submitButton())

    await waitFor(() => expect(createOnlinePaymentSession).toHaveBeenCalledTimes(1))
    expect(createOnlinePaymentSession).toHaveBeenCalledWith('order-77', { provider: 'Stripe' })
  })

  it.each([
    ['StripeSurchargeQuoteStale', 'The card payment total changed'],
    ['StripeSurchargeQuoteRequired', 'confirm the current card payment total'],
  ])('does not redirect on %s and hands off to the order payment page', async (code, copy) => {
    createOnlinePaymentSession.mockRejectedValueOnce(businessError(code))

    render(<CheckoutPage />)
    await selectOnlinePayment()
    await fillRequiredFields()
    await waitFor(() => expect(submitButton()).toBeEnabled())

    await userEvent.click(submitButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(copy)
    expect(alert).toHaveTextContent('nothing has been charged')
    expect(window.location.href).toBe('')
    expect(createOnlinePaymentSession).toHaveBeenCalledTimes(1)
    // The order must not be recreated.
    expect(createOrder).toHaveBeenCalledTimes(1)

    expect(screen.getByRole('link', { name: 'Review the updated amount and pay' })).toHaveAttribute(
      'href',
      '/orders/order-77',
    )
  })

  it('preserves the existing order-created recovery flow for a generic session failure', async () => {
    createOnlinePaymentSession.mockRejectedValueOnce(new Error('Provider unavailable'))

    render(<CheckoutPage />)
    await selectOnlinePayment()
    await fillRequiredFields()
    await waitFor(() => expect(submitButton()).toBeEnabled())

    await userEvent.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Provider unavailable')
    expect(
      screen.getByRole('link', { name: 'View your order and payment instructions' }),
    ).toHaveAttribute('href', '/checkout/success?orderId=order-77')
  })

  it('protects against double submission', async () => {
    let resolveOrder: ((order: { id: string }) => void) | undefined
    createOrder.mockReturnValue(
      new Promise((resolve) => {
        resolveOrder = resolve
      }),
    )

    render(<CheckoutPage />)
    await selectOnlinePayment()
    await fillRequiredFields()
    await waitFor(() => expect(submitButton()).toBeEnabled())

    await userEvent.click(submitButton())
    expect(submitButton()).toBeDisabled()
    await userEvent.click(submitButton())

    expect(createOrder).toHaveBeenCalledTimes(1)
    resolveOrder!({ id: 'order-77' })
  })
})
