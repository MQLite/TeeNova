'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ordersApi } from '@/api/orders'
import type { Order } from '@/types'

/**
 * Checkout cancel / payment-not-completed return page (Jira 9811).
 *
 * This page NEVER records or mutates payment: it only reads the backend-confirmed order state through the
 * public (redacted) order endpoint. If the customer bailed out of the provider's hosted page, or a payment
 * failed, they land here. Because a webhook can race the browser redirect, if the backend already shows the
 * order as paid we reassure the customer rather than telling them it was cancelled. It calls no admin or
 * mutation endpoint, exposes no reconciliation detail, and never auto-redirects anywhere.
 */
export default function CheckoutCancelPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-black" />
      </div>
    }>
      <CancelContent />
    </Suspense>
  )
}

function CancelContent() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!orderId) {
      setLoading(false)
      return
    }
    ordersApi.getById(orderId)
      .then(setOrder)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [orderId])

  // Payment truth comes only from the backend order, never from query params.
  const confirmedPaid = !!order && (order.paymentStatus === 'Paid' || order.paymentStatus === 'DepositPaid')

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="hero-gradient py-16 text-center">
        <div className="mx-auto max-w-xl px-4">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/20">
            {confirmedPaid ? (
              <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>

          <h1 className="display-section text-white mb-4">
            {confirmedPaid ? 'Payment Confirmed' : 'Payment Not Completed'}
          </h1>
          <p className="text-base text-white/70" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
            {confirmedPaid
              ? 'Good news — your payment has actually been confirmed by the payment provider.'
              : 'Your payment was not completed. No charge has been confirmed. You can try again or contact the shop.'}
          </p>

          {!loading && order && (
            <div className="mt-6 inline-flex items-center gap-3 rounded-full bg-white/15 px-6 py-2.5">
              <span className="font-mono text-sm uppercase tracking-[0.54px] text-white/70">Order Number</span>
              <span className="font-mono text-xl text-white" style={{ fontWeight: 540 }}>#{order.orderNumber}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="space-y-5">

          {/* Could not load the order — safe, never implies a charge either way. */}
          {!loading && error && (
            <div className="card px-6 py-5">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/60">
                Order status unavailable
              </p>
              <p className="text-sm text-black/70" style={{ letterSpacing: '-0.14px' }}>
                We couldn’t load your order details right now. If you started a payment, it is only ever
                confirmed by the payment provider — please check your email for a confirmation, or contact
                the shop if you’re unsure.
              </p>
            </div>
          )}

          {/* Webhook race: backend already confirmed payment. Reassure instead of saying cancelled. */}
          {!loading && order && confirmedPaid && (
            <div className="rounded-2xl border border-green-200 bg-green-50 px-6 py-5">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.54px] text-green-700">
                {order.paymentStatus === 'DepositPaid' ? 'Deposit received' : 'Payment confirmed'}
              </p>
              <p className="text-sm text-green-800" style={{ letterSpacing: '-0.14px' }}>
                Although you returned via the cancel link, the payment provider has confirmed your payment.
                No further action is needed — we’ll start processing your order shortly.
              </p>
            </div>
          )}

          {/* Not completed — safe next actions (user-initiated only; no auto session creation). */}
          {!loading && !confirmedPaid && (
            <div className="card px-6 py-5">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/60">
                What you can do next
              </p>
              <ul className="space-y-2 text-sm text-black/70" style={{ letterSpacing: '-0.14px' }}>
                {order && (
                  <li>
                    <span className="text-black/50">•</span>{' '}
                    <Link href={`/orders/${order.id}`} className="text-black underline">
                      View your order &amp; payment status
                    </Link>{' '}
                    — your order is saved; you can complete payment from there.
                  </li>
                )}
                <li>
                  <span className="text-black/50">•</span>{' '}
                  <Link href="/products" className="text-black underline">Continue shopping</Link>
                </li>
                <li>
                  <span className="text-black/50">•</span>{' '}
                  Still stuck? Please contact the shop and quote your order number
                  {order ? <> (<span className="font-mono">#{order.orderNumber}</span>)</> : null}.
                </li>
              </ul>
            </div>
          )}

          {/* Order summary (safe, redacted public fields only). */}
          {!loading && order && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-black/[0.08] px-6 py-4">
                <h2 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>Your Order</h2>
                <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
                  {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex justify-between px-6 py-3">
                <span className="text-sm text-black/60" style={{ letterSpacing: '-0.14px' }}>Total</span>
                <span className="text-sm text-black" style={{ fontWeight: 540 }}>
                  ${order.totalAmount.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            {order && (
              <Link href={`/orders/${order.id}`} className="btn-glass">
                View Order Details
              </Link>
            )}
            <Link href="/products" className="btn-black">
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
