'use client'

import { formatPaymentAmount } from '@/lib/money'
import type { OnlinePaymentQuoteState } from '@/features/checkout/online-payment-quote-state'
import type { PaymentPurpose } from '@/types'

/** Backend-derived purpose drives the first row's label — the frontend never assumes deposit vs balance. */
const PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  FullPayment: 'Order payment',
  Deposit: 'Deposit',
  Balance: 'Balance payment',
}

export const SURCHARGE_ROW_LABEL = 'Card processing surcharge'
export const TOTAL_ROW_LABEL = 'Total payable now'
export const QUOTE_LOADING_TEXT = 'Calculating secure card payment total…'

interface Props {
  state: OnlinePaymentQuoteState
  /** Optional retry action shown alongside a quote error, when the surrounding UI supports it. */
  onRetry?: () => void
  className?: string
}

/**
 * Renders the server-returned online payment quote: the commercial amount, the card-processing surcharge
 * and the total the provider will charge, plus the exact server disclosure.
 *
 * It displays only what the backend returned — no amount is derived, summed or recalculated here. When the
 * surcharge is disabled the component renders nothing, preserving the pre-surcharge checkout exactly.
 */
export function OnlinePaymentQuoteSummary({ state, onRetry, className }: Props) {
  const wrapperClass = ['space-y-2', className].filter(Boolean).join(' ')

  if (state.status === 'loading') {
    return (
      <div className={wrapperClass}>
        <p
          aria-live="polite"
          className="rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 text-sm text-black/55"
          style={{ letterSpacing: '-0.14px' }}
        >
          {QUOTE_LOADING_TEXT}
        </p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className={wrapperClass}>
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-2"
          style={{ letterSpacing: '-0.14px' }}
        >
          <p>{state.errorMessage}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="underline underline-offset-2 hover:no-underline"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    )
  }

  const quote = state.quote
  if (state.status !== 'ready' || !quote) return null

  // Surcharge disabled: no extra row, no disclosure, no change to the existing summary (Phase 4 §13).
  if (!quote.surchargeEnabled) return null

  const baseLabel = PURPOSE_LABELS[quote.purpose] ?? PURPOSE_LABELS.FullPayment

  return (
    <div className={wrapperClass}>
      <dl
        aria-live="polite"
        className="space-y-2 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3"
      >
        <QuoteRow label={baseLabel} value={formatPaymentAmount(quote.baseAmount, quote.currency)} />

        {/* Omitted when an enabled surcharge calculates to zero — no NZ$0.00 noise. */}
        {quote.surchargeAmount > 0 && (
          <QuoteRow
            label={SURCHARGE_ROW_LABEL}
            value={formatPaymentAmount(quote.surchargeAmount, quote.currency)}
          />
        )}

        <QuoteRow
          label={TOTAL_ROW_LABEL}
          value={formatPaymentAmount(quote.chargedAmount, quote.currency)}
          highlight
          className="border-t border-black/[0.08] pt-2"
        />
      </dl>

      {/* Exact server-provided disclosure — always plain visible text, never a tooltip or modal. */}
      {quote.surchargeDisclosureText && (
        <p
          className="break-words text-sm leading-relaxed text-black/60"
          style={{ letterSpacing: '-0.14px' }}
        >
          {quote.surchargeDisclosureText}
        </p>
      )}
    </div>
  )
}

function QuoteRow({
  label,
  value,
  highlight,
  className,
}: {
  label: string
  value: string
  highlight?: boolean
  className?: string
}) {
  return (
    <div className={['flex items-start justify-between gap-3', className].filter(Boolean).join(' ')}>
      <dt className="font-mono text-[10px] uppercase leading-4 tracking-[0.54px] text-black/40">
        {label}
      </dt>
      <dd
        className={highlight ? 'shrink-0 text-sm text-black' : 'shrink-0 text-sm text-black/70'}
        style={highlight ? { fontWeight: 540, letterSpacing: '-0.14px' } : { letterSpacing: '-0.14px' }}
      >
        {value}
      </dd>
    </div>
  )
}
