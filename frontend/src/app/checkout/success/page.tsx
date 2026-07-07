'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ordersApi } from '@/api/orders'
import { PaymentRequirementSummary } from '@/components/checkout/PaymentRequirementSummary'
import type { Order, OrderItem } from '@/types'

function getPrimaryPreview(item: OrderItem) {
  return getPrintSummary(item).find((print) => print.uploadedAssetUrl)?.uploadedAssetUrl
    ?? null
}

function getPrintSummary(item: OrderItem) {
  return item.prints ?? []
}

/**
 * Maps the backend-confirmed payment status to a customer-facing notice for an online-payment return.
 * The status comes ONLY from the fetched order (backend/webhook truth) — never from URL query params —
 * so a crafted success URL can never make this render "confirmed".
 */
function onlineReturnNotice(order: Order) {
  if (order.paymentStatus === 'Paid') {
    return {
      title: 'Payment confirmed',
      message: 'Your payment has been confirmed by the payment provider. We’ll start processing your order shortly.',
      container: 'border-green-200 bg-green-50',
      accent: 'text-green-700',
      body: 'text-green-800',
    }
  }
  if (order.paymentStatus === 'DepositPaid') {
    return {
      title: 'Deposit received',
      message: 'Your deposit has been confirmed by the payment provider. The remaining balance is due on pickup.',
      container: 'border-green-200 bg-green-50',
      accent: 'text-green-700',
      body: 'text-green-800',
    }
  }
  return {
    title: 'Online payment confirmation pending',
    message: 'Your online payment session was created. Payment is only confirmed after the payment provider notifies us. Please check your order status below or contact the shop if you are unsure.',
    container: 'border-amber-200 bg-amber-50',
    accent: 'text-amber-700',
    body: 'text-amber-800',
  }
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-black" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}

function SuccessContent() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')
  const mockProvider = searchParams.get('mockProvider')
  const mockSessionId = searchParams.get('mockSessionId')
  const provider = searchParams.get('provider')
  const isOnlineReturn = !!(mockProvider || mockSessionId || provider)

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

  return (
    <div className="min-h-screen bg-white">
      {/* Success hero */}
      <div className="hero-gradient py-16 text-center">
        <div className="mx-auto max-w-xl px-4">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/20">
            <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="display-section text-white mb-4">Order Placed!</h1>
          <p className="text-base text-white/70" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
            {isOnlineReturn
              ? "Your order has been received. Payment confirmation may take a moment — please check your order status below."
              : "Your order has been received. Please arrange payment using the instructions below — we’ll start processing once payment is confirmed."}
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

          {/* Could not load the order — never blocks the page, never implies payment succeeded. */}
          {!loading && error && (
            <div className="rounded-2xl border border-black/10 bg-black/[0.02] px-6 py-5">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/60">
                Order status unavailable
              </p>
              <p className="text-sm text-black/70" style={{ letterSpacing: '-0.14px' }}>
                We couldn’t load your order details right now. Your order may still have been placed —
                please check your email for confirmation, or contact the shop if you’re unsure. Payment is
                only ever confirmed by the payment provider, never by this page.
              </p>
            </div>
          )}

          {/* Online payment status — AUTHORITATIVE from backend paymentStatus, never from query params. */}
          {isOnlineReturn && !loading && order && (() => {
            const notice = onlineReturnNotice(order)
            return (
              <div className={`rounded-2xl border px-6 py-5 ${notice.container}`}>
                <p className={`mb-2 font-mono text-[11px] uppercase tracking-[0.54px] ${notice.accent}`}>
                  {notice.title}
                </p>
                <p className={`text-sm ${notice.body}`} style={{ letterSpacing: '-0.14px' }}>
                  {notice.message}
                </p>
                <div className="mt-3">
                  <Link href={`/orders/${order.id}`} className={`text-sm underline ${notice.accent}`}>
                    Check your order status →
                  </Link>
                </div>
              </div>
            )
          })()}

          {/* Payment Instructions — manual orders only */}
          {!isOnlineReturn && !loading && order && (
            <div className="card overflow-hidden">
              <div className="border-b border-black/[0.08] px-6 py-4">
                <h2 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>Payment Instructions</h2>
              </div>
              <div className="p-6">
                <PaymentRequirementSummary
                  mode="success"
                  deliveryMethod={order.deliveryMethod}
                  totalAmount={order.totalAmount}
                  paymentRequirementType={order.paymentRequirementType}
                  requiredDepositAmount={order.requiredDepositAmount}
                  requiredPaymentAmount={order.requiredPaymentAmount}
                  balanceAmount={order.balanceAmount}
                  paymentStatus={order.paymentStatus}
                  orderNumber={order.orderNumber}
                />
              </div>
            </div>
          )}

          {/* What happens next */}
          <div className="card overflow-hidden">
            <div className="border-b border-black/[0.08] px-6 py-4">
              <h2 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>What happens next?</h2>
            </div>
            <div className="divide-y divide-black/[0.06]">
              {[
                { step: '1', title: 'Payment Confirmation',  desc: 'Once we receive your payment, we will confirm your order and begin reviewing your design files.', eta: 'After payment' },
                { step: '2', title: 'Production',            desc: 'Your custom T-shirts are printed and quality checked.',                                             eta: '2–4 business days' },
                { step: '3', title: 'Dispatch / Pickup',     desc: 'Your order is packed and ready for pickup or dispatched via NZ Post.',                             eta: '1–2 business days' },
                { step: '4', title: 'Delivered',             desc: 'Your order arrives. Enjoy your custom tee!',                                                       eta: '1–3 business days' },
              ].map(({ step, title, desc, eta }) => (
                <div key={step} className="flex gap-4 px-6 py-4">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-xs font-medium text-white">
                    {step}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>{title}</p>
                    <p className="mt-0.5 text-sm text-black/55" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>{desc}</p>
                  </div>
                  <span className="mt-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">{eta}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Order items */}
          {!loading && order && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-black/[0.08] px-6 py-4">
                <h2 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>Your Order</h2>
                <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
                  {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="divide-y divide-black/[0.06]">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-6 py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/[0.08] bg-black/[0.02]">
                      {getPrimaryPreview(item) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={getPrimaryPreview(item) ?? ''} alt="" className="h-full w-full object-contain p-0.5" />
                      ) : (
                        <svg viewBox="0 0 200 220" className="h-5 w-5 text-black/[0.08]" fill="currentColor">
                          <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                        {item.productName}
                      </p>
                      <p className="text-xs text-black/50" style={{ letterSpacing: '-0.14px' }}>
                        {item.variantLabel} x {item.quantity}
                      </p>
                      {getPrintSummary(item).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {getPrintSummary(item).map((print) => (
                            <span key={print.id} className="inline-flex flex-col rounded-lg border border-black/[0.08] px-2 py-1 text-[10px] text-black/55">
                              <span className="font-mono uppercase tracking-[0.54px]">
                                {print.printAreaName} · {print.printSizeName}
                              </span>
                              {print.uploadedAssetUrl && <span className="text-green-600">Design uploaded</span>}
                              {print.designNote && <span className="normal-case tracking-normal text-black/45">{print.designNote}</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-sm text-black" style={{ fontWeight: 480 }}>${item.lineTotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-black/[0.08] bg-black/[0.02] px-6 py-3">
                <span className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>Total</span>
                <span className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                  ${order.totalAmount.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Confirmation email notice */}
          {!loading && order && (
            <div className="card flex items-start gap-3 px-5 py-4">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-xs">
                ✓
              </div>
              <p className="text-sm text-black/60" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
                A confirmation has been sent to <strong className="text-black" style={{ fontWeight: 480 }}>{order.customerEmail}</strong>.
                Please check your inbox and spam folder for updates.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            {order && (
              <Link href={`/orders/${order.id}`} className="btn-glass">
                View Full Order Details
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
