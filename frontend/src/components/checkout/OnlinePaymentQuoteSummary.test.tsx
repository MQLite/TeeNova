import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnlinePaymentQuoteSummary } from './OnlinePaymentQuoteSummary'
import {
  initialOnlinePaymentQuoteState,
  type OnlinePaymentQuoteState,
} from '@/features/checkout/online-payment-quote-state'
import type { OnlinePaymentQuote } from '@/types'

const canonicalQuote: OnlinePaymentQuote = {
  provider: 'Stripe',
  currency: 'NZD',
  purpose: 'FullPayment',
  baseAmount: 100,
  surchargeEnabled: true,
  surchargeAmount: 3.04,
  chargedAmount: 103.04,
  surchargeDisclosureText:
    'A card processing surcharge applies to online card payments. The fee is shown before you continue to Stripe.',
  surchargePercentageBasisPoints: 265,
  surchargeFixedAmount: 0.3,
  calculationVersion: 'stripe-gross-up-v1',
  quoteFingerprint: 'fingerprint-abc',
}

function readyState(overrides: Partial<OnlinePaymentQuote> = {}): OnlinePaymentQuoteState {
  return {
    ...initialOnlinePaymentQuoteState,
    status: 'ready',
    generation: 1,
    signature: 'sig',
    quote: { ...canonicalQuote, ...overrides },
  }
}

describe('OnlinePaymentQuoteSummary', () => {
  it('displays the canonical NZ$100 breakdown exactly as returned by the backend', () => {
    render(<OnlinePaymentQuoteSummary state={readyState()} />)

    expect(screen.getByText('Order payment')).toBeInTheDocument()
    expect(screen.getByText('NZ$100.00')).toBeInTheDocument()
    expect(screen.getByText('Card processing surcharge')).toBeInTheDocument()
    expect(screen.getByText('NZ$3.04')).toBeInTheDocument()
    expect(screen.getByText('Total payable now')).toBeInTheDocument()
    expect(screen.getByText('NZ$103.04')).toBeInTheDocument()

    // The wrong, pre-fix rounding must never appear.
    expect(screen.queryByText('NZ$103.03')).not.toBeInTheDocument()
    expect(screen.queryByText('NZ$3.03')).not.toBeInTheDocument()
  })

  it('displays the server disclosure verbatim as plain visible text', () => {
    render(<OnlinePaymentQuoteSummary state={readyState()} />)

    const disclosure = screen.getByText(canonicalQuote.surchargeDisclosureText!)
    expect(disclosure).toBeVisible()
    expect(disclosure.tagName).toBe('P')
  })

  it.each([
    ['Deposit' as const, 'Deposit'],
    ['Balance' as const, 'Balance payment'],
    ['FullPayment' as const, 'Order payment'],
  ])('labels the first row from the backend purpose %s', (purpose, label) => {
    render(<OnlinePaymentQuoteSummary state={readyState({ purpose })} />)

    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('renders nothing when the surcharge is disabled', () => {
    const { container } = render(
      <OnlinePaymentQuoteSummary
        state={readyState({
          surchargeEnabled: false,
          surchargeAmount: 0,
          chargedAmount: 100,
          surchargeDisclosureText: null,
          quoteFingerprint: '',
        })}
      />,
    )

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Card processing surcharge')).not.toBeInTheDocument()
  })

  it('omits a zero-value surcharge row while keeping the enabled breakdown', () => {
    render(
      <OnlinePaymentQuoteSummary
        state={readyState({ surchargeAmount: 0, chargedAmount: 100 })}
      />,
    )

    expect(screen.queryByText('Card processing surcharge')).not.toBeInTheDocument()
    expect(screen.getByText('Total payable now')).toBeInTheDocument()
  })

  it('renders exactly one surcharge row', () => {
    render(<OnlinePaymentQuoteSummary state={readyState()} />)

    expect(screen.getAllByText('Card processing surcharge')).toHaveLength(1)
  })

  it('announces the loading state politely', () => {
    render(
      <OnlinePaymentQuoteSummary
        state={{ ...initialOnlinePaymentQuoteState, status: 'loading', signature: 'sig' }}
      />,
    )

    const loading = screen.getByText('Calculating secure card payment total…')
    expect(loading).toHaveAttribute('aria-live', 'polite')
  })

  it('never shows a previous quote while a new one is loading', () => {
    render(
      <OnlinePaymentQuoteSummary
        state={{ ...initialOnlinePaymentQuoteState, status: 'loading', signature: 'sig' }}
      />,
    )

    expect(screen.queryByText('NZ$103.04')).not.toBeInTheDocument()
  })

  it('reports an error through an accessible alert', () => {
    render(
      <OnlinePaymentQuoteSummary
        state={{
          ...initialOnlinePaymentQuoteState,
          status: 'error',
          signature: 'sig',
          errorCode: 'StripeCurrencyUnsupported',
          errorKind: 'blocked',
          errorMessage: 'Card payments are temporarily unavailable for this order.',
        }}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Card payments are temporarily unavailable for this order.')
    // No guessed fee or total is shown alongside the failure.
    expect(screen.queryByText(/NZ\$/)).not.toBeInTheDocument()
  })

  it('offers a retry action when the parent supports it', async () => {
    const onRetry = vi.fn()
    render(
      <OnlinePaymentQuoteSummary
        state={{
          ...initialOnlinePaymentQuoteState,
          status: 'error',
          signature: 'sig',
          errorMessage: 'We couldn’t calculate the current card payment total.',
        }}
        onRetry={onRetry}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders nothing while idle', () => {
    const { container } = render(
      <OnlinePaymentQuoteSummary state={initialOnlinePaymentQuoteState} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('associates each label with its amount in a description list', () => {
    render(<OnlinePaymentQuoteSummary state={readyState()} />)

    const label = screen.getByText('Card processing surcharge')
    expect(label.tagName).toBe('DT')
    expect(label.nextElementSibling?.tagName).toBe('DD')
    expect(label.nextElementSibling).toHaveTextContent('NZ$3.04')
  })

  it('wraps long disclosure text rather than overflowing', () => {
    const long = 'A card processing surcharge applies to online card payments. '.repeat(8)
    render(<OnlinePaymentQuoteSummary state={readyState({ surchargeDisclosureText: long })} />)

    expect(screen.getByText(long.trim(), { exact: false }).className).toContain('break-words')
  })
})
