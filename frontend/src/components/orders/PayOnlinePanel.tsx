'use client'

import { useState } from 'react'
import { ordersApi } from '@/api/orders'
import { Button } from '@/components/ui/Button'
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

  if (balanceAmount <= 0 || paymentStatus === 'Paid' || orderStatus === 'Cancelled' || orderStatus === 'Completed') {
    return null
  }

  async function handlePayOnline() {
    if (isCreatingSession) return
    setIsCreatingSession(true)
    setSessionError(null)
    try {
      const session = await ordersApi.createOnlinePaymentSession(orderId, { provider: selectedProvider })
      window.location.href = session.providerCheckoutUrl
    } catch (err) {
      setSessionError(
        err instanceof Error
          ? err.message
          : 'The online payment session could not be created. You can still arrange payment manually with the shop.',
      )
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
                onChange={() => setSelectedProvider(value)}
                className="sr-only"
              />
              <span style={{ fontWeight: selected ? 540 : 480, letterSpacing: '-0.14px' }}>
                {label}
              </span>
            </label>
          )
        })}
      </div>

      <Button
        type="button"
        className="w-full"
        size="lg"
        loading={isCreatingSession}
        onClick={handlePayOnline}
      >
        {isCreatingSession ? 'Creating payment session…' : `Pay Online with ${selectedProvider} →`}
      </Button>

      {sessionError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
