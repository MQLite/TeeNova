'use client'

import { useMemo, useState } from 'react'
import { ordersApi } from '@/api/orders'
import { Button } from '@/components/ui/Button'
import { OnlinePaymentQuoteSummary } from '@/components/checkout/OnlinePaymentQuoteSummary'
import {
  chargedAmountOf,
  isStripePaymentBlocked,
  usableQuoteFingerprint,
} from '@/features/checkout/online-payment-quote-state'
import { useOnlinePaymentQuote } from '@/features/checkout/useOnlinePaymentQuote'
import { formatPaymentAmount } from '@/lib/money'
import { classifySessionError, requiresFreshQuote } from '@/lib/payment-errors'
import type { OrderStatus, PaymentProvider, PaymentStatus } from '@/types'

const PROVIDER_OPTIONS: { value: PaymentProvider; label: string }[] = [
  { value: 'Stripe',   label: 'Stripe'   },
  { value: 'Windcave', label: 'Windcave' },
  { value: 'Poli',     label: 'POLi'     },
  { value: 'PayPal',   label: 'PayPal'   },
]

interface Props {
  orderId: string
  balanceAmount: number
  orderStatus: OrderStatus
  paymentStatus: PaymentStatus
}

export function PayOnlinePanel({ orderId, balanceAmount, orderStatus, paymentStatus }: Props) {
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>('Stripe')
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)

  const eligible =
    balanceAmount > 0 &&
    paymentStatus !== 'Paid' &&
    orderStatus !== 'Cancelled' &&
    orderStatus !== 'Completed'

  const stripeSelected = selectedProvider === 'Stripe'

  // ── Server-authoritative payment quote (Stripe surcharge, Phase 4) ────────────
  // The panel never assumes the payable amount is `balanceAmount`: a pickup order may owe only its
  // outstanding deposit. The backend returns the purpose and the commercial base actually payable now.
  //
  // The signature includes the order's payment state, so when the page re-renders with refreshed order
  // data (a payment landed, an admin adjusted the price) the previous quote and its fingerprint are
  // invalidated and a fresh quote is fetched before payment can continue.
  const quoteSignature = useMemo(
    () =>
      JSON.stringify({
        orderId,
        provider: selectedProvider,
        balanceAmount,
        orderStatus,
        paymentStatus,
      }),
    [orderId, selectedProvider, balanceAmount, orderStatus, paymentStatus],
  )

  const { state: quoteState, refresh: refreshQuote } = useOnlinePaymentQuote({
    enabled: eligible && stripeSelected,
    signature: quoteSignature,
    fetchQuote: () =>
      ordersApi.getExistingOrderOnlinePaymentQuote(orderId, { provider: selectedProvider }),
  })

  if (!eligible) {
    return null
  }

  const stripeBlocked = stripeSelected && isStripePaymentBlocked(quoteState)
  const chargedAmount = chargedAmountOf(quoteState)
  const showChargedTotal = stripeSelected && chargedAmount != null && quoteState.quote?.surchargeEnabled

  function selectProvider(provider: PaymentProvider) {
    // Switching provider clears any Stripe-specific failure alongside the quote (the hook resets its own
    // state via the changed signature / disabled flag).
    setSelectedProvider(provider)
    setSessionError(null)
  }

  async function handlePayOnline() {
    if (isCreatingSession) return

    if (stripeBlocked) {
      setSessionError(
        quoteState.errorMessage ??
          'We’re still calculating the secure card payment total. Please wait a moment and try again.',
      )
      return
    }

    // Only ever the fingerprint of the quote currently on screen; null when no surcharge applies.
    const paymentQuoteFingerprint = usableQuoteFingerprint(quoteState)

    setIsCreatingSession(true)
    setSessionError(null)

    try {
      const session = await ordersApi.createOnlinePaymentSession(orderId, {
        provider: selectedProvider,
        ...(paymentQuoteFingerprint ? { paymentQuoteFingerprint } : {}),
      })
      window.location.href = session.providerCheckoutUrl
    } catch (err) {
      const classified = classifySessionError(err)
      setSessionError(classified.message)

      // Quote required / stale: fetch a fresh quote so the customer sees the current total, then require
      // another deliberate click. Never auto-resubmit and never redirect at an undisclosed amount.
      if (requiresFreshQuote(classified.kind)) {
        refreshQuote()
      }

      setIsCreatingSession(false)
    }
  }

  return (
    <div className="rounded-2xl border border-black/[0.08] p-4 space-y-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
        Pay Online
      </p>

      <div className="flex flex-wrap gap-2">
        {PROVIDER_OPTIONS.map(({ value, label }) => {
          const selected = selectedProvider === value
          return (
            <label
              key={value}
              className={[
                'cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors',
                selected
                  ? 'border-black bg-black text-white'
                  : 'border-black/[0.15] text-black hover:border-black/40',
              ].join(' ')}
            >
              <input
                type="radio"
                name="payOnlineProvider"
                value={value}
                checked={selected}
                onChange={() => selectProvider(value)}
                className="sr-only"
              />
              <span style={{ fontWeight: selected ? 540 : 480, letterSpacing: '-0.14px' }}>
                {label}
              </span>
            </label>
          )
        })}
      </div>

      {/* Amount breakdown + exact server disclosure, above the payment button. */}
      {stripeSelected && <OnlinePaymentQuoteSummary state={quoteState} onRetry={refreshQuote} />}

      <Button
        type="button"
        className="w-full"
        size="lg"
        loading={isCreatingSession}
        disabled={isCreatingSession || stripeBlocked}
        onClick={handlePayOnline}
      >
        {isCreatingSession
          ? 'Creating payment session…'
          : showChargedTotal
            ? `Pay ${formatPaymentAmount(chargedAmount!, quoteState.quote?.currency)} securely with Stripe →`
            : `Pay Online with ${selectedProvider} →`}
      </Button>

      {sessionError && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          {sessionError}
        </div>
      )}

      <p className="text-center text-xs text-black/40" style={{ letterSpacing: '-0.14px' }}>
        You&apos;ll be redirected to a secure hosted payment page. Payment confirmation
        happens after the provider processes your payment.
      </p>
    </div>
  )
}
