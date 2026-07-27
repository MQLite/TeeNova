import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PayOnlinePanel } from './PayOnlinePanel'
import { ApiError } from '@/lib/api-client'
import type { OnlinePaymentQuote } from '@/types'

const getExistingOrderOnlinePaymentQuote = vi.fn()
const createOnlinePaymentSession = vi.fn()

vi.mock('@/api/orders', () => ({
  ordersApi: {
    getExistingOrderOnlinePaymentQuote: (...args: unknown[]) =>
      getExistingOrderOnlinePaymentQuote(...args),
    createOnlinePaymentSession: (...args: unknown[]) => createOnlinePaymentSession(...args),
  },
}))

const depositQuote: OnlinePaymentQuote = {
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
  quoteFingerprint: 'fingerprint-deposit',
}

const defaultProps = {
  orderId: 'order-1',
  balanceAmount: 200,
  orderStatus: 'Pending' as const,
  paymentStatus: 'DepositRequired' as const,
}

function businessError(code: string): ApiError {
  return new ApiError(403, 'blocked', { error: { code: `TeeNova:Payment:${code}` } })
}

function payButton() {
  return screen.getByRole('button', { name: /pay/i })
}

beforeEach(() => {
  getExistingOrderOnlinePaymentQuote.mockReset().mockResolvedValue(depositQuote)
  createOnlinePaymentSession.mockReset().mockResolvedValue({
    providerCheckoutUrl: 'https://checkout.stripe.test/c/session',
  })
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: '' },
  })
})

describe('PayOnlinePanel — quote fetching', () => {
  it('requests the existing-order quote when Stripe is selected', async () => {
    render(<PayOnlinePanel {...defaultProps} />)

    await waitFor(() =>
      expect(getExistingOrderOnlinePaymentQuote).toHaveBeenCalledWith('order-1', {
        provider: 'Stripe',
      }),
    )
  })

  it('displays the backend purpose and base amount rather than assuming the balance', async () => {
    render(<PayOnlinePanel {...defaultProps} />)

    // Order balance is 200, but only the 100 deposit is payable now.
    expect(await screen.findByText('Deposit')).toBeInTheDocument()
    expect(screen.getByText('NZ$100.00')).toBeInTheDocument()
    expect(screen.getByText('NZ$3.04')).toBeInTheDocument()
    expect(screen.getByText('NZ$103.04')).toBeInTheDocument()
    expect(screen.queryByText('NZ$200.00')).not.toBeInTheDocument()
  })

  it('shows the exact server disclosure before the payment button', async () => {
    render(<PayOnlinePanel {...defaultProps} />)

    const disclosure = await screen.findByText(depositQuote.surchargeDisclosureText!)
    expect(disclosure).toBeVisible()
    expect(disclosure.compareDocumentPosition(payButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not request a Stripe quote for another provider', async () => {
    render(<PayOnlinePanel {...defaultProps} />)
    await waitFor(() => expect(getExistingOrderOnlinePaymentQuote).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole('radio', { name: 'PayPal' }))

    await waitFor(() => expect(screen.queryByText('NZ$3.04')).not.toBeInTheDocument())
    expect(getExistingOrderOnlinePaymentQuote).toHaveBeenCalledTimes(1)
  })

  it('removes the fee immediately when the provider changes and restores it on switching back', async () => {
    render(<PayOnlinePanel {...defaultProps} />)
    expect(await screen.findByText('Card processing surcharge')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'POLi' }))
    await waitFor(() => expect(screen.queryByText('Card processing surcharge')).not.toBeInTheDocument())
    expect(payButton()).toHaveTextContent('Pay Online with Poli')

    await userEvent.click(screen.getByRole('radio', { name: 'Stripe' }))
    await waitFor(() => expect(getExistingOrderOnlinePaymentQuote).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Card processing surcharge')).toBeInTheDocument()
  })

  it('invalidates the quote when refreshed order data changes the payment state', async () => {
    const { rerender } = render(<PayOnlinePanel {...defaultProps} />)
    await waitFor(() => expect(getExistingOrderOnlinePaymentQuote).toHaveBeenCalledTimes(1))

    getExistingOrderOnlinePaymentQuote.mockResolvedValue({
      ...depositQuote,
      purpose: 'Balance',
      baseAmount: 100,
      chargedAmount: 103.04,
      quoteFingerprint: 'fingerprint-balance',
    })

    rerender(<PayOnlinePanel {...defaultProps} balanceAmount={100} paymentStatus="DepositPaid" />)

    await waitFor(() => expect(getExistingOrderOnlinePaymentQuote).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Balance payment')).toBeInTheDocument()
  })

  it('renders nothing when the order has nothing left to pay', () => {
    const { container } = render(
      <PayOnlinePanel {...defaultProps} balanceAmount={0} paymentStatus="Paid" />,
    )

    expect(container).toBeEmptyDOMElement()
    expect(getExistingOrderOnlinePaymentQuote).not.toHaveBeenCalled()
  })
})

describe('PayOnlinePanel — button state', () => {
  it('disables payment while the quote is loading', async () => {
    let resolveQuote: ((quote: OnlinePaymentQuote) => void) | undefined
    getExistingOrderOnlinePaymentQuote.mockReturnValue(
      new Promise<OnlinePaymentQuote>((resolve) => {
        resolveQuote = resolve
      }),
    )

    render(<PayOnlinePanel {...defaultProps} />)

    expect(payButton()).toBeDisabled()
    expect(screen.getByText('Calculating secure card payment total…')).toBeInTheDocument()

    resolveQuote!(depositQuote)
    await waitFor(() => expect(payButton()).toBeEnabled())
  })

  it('disables payment and shows an alert when the quote fails', async () => {
    getExistingOrderOnlinePaymentQuote.mockRejectedValue(
      businessError('StripeSurchargeConfigurationInvalid'),
    )

    render(<PayOnlinePanel {...defaultProps} />)

    await waitFor(() => expect(payButton()).toBeDisabled())
    expect(await screen.findByRole('alert')).toHaveTextContent('Card payments are temporarily unavailable')
  })

  it('names the button with the charged total once the quote is ready', async () => {
    render(<PayOnlinePanel {...defaultProps} />)

    await waitFor(() =>
      expect(payButton()).toHaveAccessibleName('Pay NZ$103.04 securely with Stripe →'),
    )
  })

  it('keeps a non-Stripe provider on the existing wording with no quote gate', async () => {
    render(<PayOnlinePanel {...defaultProps} />)
    await waitFor(() => expect(getExistingOrderOnlinePaymentQuote).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('radio', { name: 'Windcave' }))

    await waitFor(() => expect(payButton()).toHaveTextContent('Pay Online with Windcave'))
    expect(payButton()).toBeEnabled()
  })

  it('keeps the payment methods keyboard operable after a quote error', async () => {
    getExistingOrderOnlinePaymentQuote.mockRejectedValue(new Error('network down'))

    render(<PayOnlinePanel {...defaultProps} />)
    await waitFor(() => expect(payButton()).toBeDisabled())

    await userEvent.tab()
    await userEvent.keyboard('{ArrowRight}')

    await waitFor(() => expect(screen.getByRole('radio', { name: 'Windcave' })).toBeChecked())
    expect(payButton()).toBeEnabled()
  })
})

describe('PayOnlinePanel — session creation', () => {
  it('submits the fingerprint of the displayed quote and nothing monetary', async () => {
    render(<PayOnlinePanel {...defaultProps} />)
    await waitFor(() => expect(payButton()).toBeEnabled())

    await userEvent.click(payButton())

    await waitFor(() => expect(createOnlinePaymentSession).toHaveBeenCalledTimes(1))
    expect(createOnlinePaymentSession).toHaveBeenCalledWith('order-1', {
      provider: 'Stripe',
      paymentQuoteFingerprint: 'fingerprint-deposit',
    })
  })

  it('redirects only after a successful session', async () => {
    render(<PayOnlinePanel {...defaultProps} />)
    await waitFor(() => expect(payButton()).toBeEnabled())

    await userEvent.click(payButton())

    await waitFor(() =>
      expect(window.location.href).toBe('https://checkout.stripe.test/c/session'),
    )
  })

  it('omits the fingerprint entirely when the surcharge is disabled', async () => {
    getExistingOrderOnlinePaymentQuote.mockResolvedValue({
      ...depositQuote,
      surchargeEnabled: false,
      surchargeAmount: 0,
      chargedAmount: 100,
      surchargeDisclosureText: null,
      quoteFingerprint: '',
    })

    render(<PayOnlinePanel {...defaultProps} />)
    await waitFor(() => expect(payButton()).toBeEnabled())

    await userEvent.click(payButton())

    await waitFor(() => expect(createOnlinePaymentSession).toHaveBeenCalledTimes(1))
    expect(createOnlinePaymentSession).toHaveBeenCalledWith('order-1', { provider: 'Stripe' })
    expect(screen.queryByText('Card processing surcharge')).not.toBeInTheDocument()
  })

  it.each([
    ['StripeSurchargeQuoteStale', 'The card payment total changed'],
    ['StripeSurchargeQuoteRequired', 'confirm the current card payment total'],
  ])('refetches after %s without redirecting or resubmitting', async (code, expectedCopy) => {
    createOnlinePaymentSession.mockRejectedValueOnce(businessError(code))

    render(<PayOnlinePanel {...defaultProps} />)
    await waitFor(() => expect(payButton()).toBeEnabled())

    await userEvent.click(payButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(expectedCopy)
    // No redirect, exactly one session attempt, and a fresh quote was requested.
    expect(window.location.href).toBe('')
    expect(createOnlinePaymentSession).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(getExistingOrderOnlinePaymentQuote).toHaveBeenCalledTimes(2))
  })

  it('requires another explicit click after a stale quote is refreshed', async () => {
    createOnlinePaymentSession.mockRejectedValueOnce(businessError('StripeSurchargeQuoteStale'))
    getExistingOrderOnlinePaymentQuote
      .mockResolvedValueOnce(depositQuote)
      .mockResolvedValue({ ...depositQuote, chargedAmount: 108.2, quoteFingerprint: 'fingerprint-new' })

    render(<PayOnlinePanel {...defaultProps} />)
    await waitFor(() => expect(payButton()).toBeEnabled())
    await userEvent.click(payButton())

    // Updated amount is displayed; still only one attempt until the customer acts again.
    await waitFor(() => expect(screen.getByText('NZ$108.20')).toBeInTheDocument())
    expect(createOnlinePaymentSession).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(payButton()).toBeEnabled())
    await userEvent.click(payButton())

    await waitFor(() => expect(createOnlinePaymentSession).toHaveBeenCalledTimes(2))
    expect(createOnlinePaymentSession).toHaveBeenLastCalledWith('order-1', {
      provider: 'Stripe',
      paymentQuoteFingerprint: 'fingerprint-new',
    })
  })

  it('keeps the existing generic failure behaviour', async () => {
    createOnlinePaymentSession.mockRejectedValueOnce(new Error('Provider unavailable'))

    render(<PayOnlinePanel {...defaultProps} />)
    await waitFor(() => expect(payButton()).toBeEnabled())

    await userEvent.click(payButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Provider unavailable')
    expect(window.location.href).toBe('')
    // A generic failure does NOT force a refetch.
    expect(getExistingOrderOnlinePaymentQuote).toHaveBeenCalledTimes(1)
  })

  it('protects against double-clicks', async () => {
    let resolveSession: ((value: { providerCheckoutUrl: string }) => void) | undefined
    createOnlinePaymentSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve
      }),
    )

    render(<PayOnlinePanel {...defaultProps} />)
    await waitFor(() => expect(payButton()).toBeEnabled())

    await userEvent.click(payButton())
    expect(payButton()).toBeDisabled()
    await userEvent.click(payButton())

    expect(createOnlinePaymentSession).toHaveBeenCalledTimes(1)
    resolveSession!({ providerCheckoutUrl: 'https://checkout.stripe.test/c/session' })
  })
})
