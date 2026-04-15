'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ordersApi } from '@/api/orders'
import { Button } from '@/components/ui/Button'
import type { Order, OrderItem } from '@/types'

function formatPosition(value: string) {
  return value.replace(/([A-Z])/g, ' $1').trim()
}

function getPositionAssets(item: OrderItem) {
  return item.positionAssets ?? []
}

function getPrimaryPreview(item: OrderItem) {
  return getPositionAssets(item)[0]?.uploadedAssetUrl ?? null
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" /></div>}>
      <SuccessContent />
    </Suspense>
  )
}

function SuccessContent() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orderId) {
      setLoading(false)
      return
    }

    ordersApi.getById(orderId)
      .then(setOrder)
      .finally(() => setLoading(false))
  }, [orderId])

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="bg-gradient-to-br from-brand-950 via-brand-800 to-brand-600 py-16 text-center">
        <div className="mx-auto max-w-xl px-4">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white/15 ring-4 ring-white/20 backdrop-blur-sm">
            <svg className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-4xl font-extrabold text-white sm:text-5xl">Order Placed!</h1>
          <p className="mt-3 text-lg text-brand-200">
            Thank you for your order. We&apos;ll get started on your custom T-shirt right away.
          </p>

          {!loading && order && (
            <div className="mt-6 inline-flex items-center gap-3 rounded-2xl bg-white/10 px-6 py-3 backdrop-blur-sm">
              <span className="text-sm font-medium text-brand-200">Order Number</span>
              <span className="font-mono text-xl font-bold text-white">#{order.orderNumber}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="space-y-5">
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
              <h2 className="font-bold text-gray-900">What happens next?</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {[
                { step: '1', title: 'Order Review', desc: 'Our team reviews your design files and order details within 1 business day.', eta: 'Today - Tomorrow', color: 'bg-brand-600' },
                { step: '2', title: 'Production', desc: 'Your custom T-shirts are printed and quality checked.', eta: '2-3 business days', color: 'bg-purple-600' },
                { step: '3', title: 'Dispatch', desc: 'Your order is packed and handed to NZ Post for delivery.', eta: '1-2 business days', color: 'bg-blue-600' },
                { step: '4', title: 'Delivered', desc: 'Your order arrives at your door. Enjoy your custom tee!', eta: '1-3 business days', color: 'bg-green-600' },
              ].map(({ step, title, desc, eta, color }) => (
                <div key={step} className="flex gap-4 px-6 py-4">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${color} text-sm font-bold text-white`}>
                    {step}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{title}</p>
                    <p className="mt-0.5 text-sm text-gray-500">{desc}</p>
                  </div>
                  <span className="mt-1 shrink-0 text-xs font-medium text-gray-400">{eta}</span>
                </div>
              ))}
            </div>
          </div>

          {!loading && order && (
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4">
                <h2 className="font-bold text-gray-900">Your Order</h2>
                <span className="text-xs text-gray-500">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-6 py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-brand-50">
                      {getPrimaryPreview(item) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={getPrimaryPreview(item) ?? ''} alt="" className="h-full w-full object-contain p-0.5" />
                      ) : (
                        <svg viewBox="0 0 200 220" className="h-5 w-5 text-brand-200" fill="currentColor">
                          <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{item.productName}</p>
                      {getPositionAssets(item).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {getPositionAssets(item).map((positionAsset) => (
                            <span
                              key={positionAsset.id}
                              className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700"
                            >
                              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                                <path fillRule="evenodd" d="M8 1.5a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5V2a.5.5 0 01.5-.5z" clipRule="evenodd" />
                              </svg>
                              {formatPosition(positionAsset.position)}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-500">{item.variantLabel} x {item.quantity}</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900">${item.lineTotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-gray-100 bg-gray-50 px-6 py-3">
                <span className="text-sm font-bold text-gray-900">Total</span>
                <span className="text-sm font-extrabold text-brand-600">${order.totalAmount.toFixed(2)}</span>
              </div>
            </div>
          )}

          {!loading && order && (
            <div className="flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50 px-5 py-4">
              <span className="shrink-0 text-xl">Mail</span>
              <p className="text-sm text-brand-800">
                A confirmation has been sent to <strong>{order.customerEmail}</strong>. Please check your inbox and spam folder for updates.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            {order && (
              <Button variant="secondary" asChild>
                <Link href={`/orders/${order.id}`}>View Full Order Details</Link>
              </Button>
            )}
            <Button asChild>
              <Link href="/products">Continue Shopping</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
