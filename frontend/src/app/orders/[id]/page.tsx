import Link from 'next/link'
import { ordersApi } from '@/api/orders'
import { Badge } from '@/components/ui/Badge'
import { DownloadDesignButton } from '@/components/orders/DownloadDesignButton'
import type { OrderItem, OrderStatus } from '@/types'

export const metadata = { title: 'Order Details' }

const statusColors: Record<OrderStatus, 'gray' | 'blue' | 'yellow' | 'green' | 'purple' | 'red'> = {
  Pending: 'gray',
  Paid: 'green',
  Reviewing: 'blue',
  Printing: 'purple',
  Ready: 'green',
  Completed: 'green',
  Confirmed: 'blue',
  InProduction: 'purple',
  Shipped: 'blue',
  Delivered: 'green',
  Cancelled: 'red',
}

const statusMessages: Record<OrderStatus, { title: string; desc: string }> = {
  Pending: { title: 'Order received', desc: 'We have received your order and are waiting for payment confirmation.' },
  Paid: { title: 'Payment received', desc: 'Your payment has been recorded and your order is ready for review.' },
  Reviewing: { title: 'Under review', desc: 'Our team is reviewing your artwork and print setup before production.' },
  Printing: { title: 'In production', desc: 'Your order is currently in the printing phase.' },
  Ready: { title: 'Ready for pickup', desc: 'Your order is ready and waiting for collection or final handoff.' },
  Completed: { title: 'Order completed', desc: 'This order has been completed successfully.' },
  Confirmed: { title: 'Order confirmed', desc: 'Your order has been confirmed and will enter production soon.' },
  InProduction: { title: 'Being printed', desc: 'Your custom T-shirt is currently being printed.' },
  Shipped: { title: 'On its way', desc: 'Your order has shipped and is heading to you.' },
  Delivered: { title: 'Delivered', desc: 'Your order has been delivered. Enjoy your custom tee!' },
  Cancelled: { title: 'Order cancelled', desc: 'This order has been cancelled.' },
}

interface PageProps {
  params: Promise<{ id: string }>
}

function formatPosition(value: string) {
  return value.replace(/([A-Z])/g, ' $1').trim()
}

function getPositionAssets(item: OrderItem) {
  return item.positionAssets ?? []
}

function getPrimaryPreview(item: OrderItem) {
  return getPositionAssets(item)[0]?.uploadedAssetUrl ?? null
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params
  const order = await ordersApi.getById(id)

  const status = (typeof order.status === 'number'
    ? (['Pending', 'Confirmed', 'InProduction', 'Shipped', 'Delivered', 'Cancelled', 'Paid', 'Reviewing'] as const)[order.status as unknown as number]
    : order.status) ?? 'Pending'
  const safeOrder = { ...order, status }

  const msg = statusMessages[safeOrder.status] ?? statusMessages.Pending
  const isCancelled = safeOrder.status === 'Cancelled'

  return (
    <div className="min-h-screen bg-white">
      {/* Status hero */}
      <div className={isCancelled ? 'bg-black/[0.04] py-12' : 'hero-gradient py-12'}>
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
            {isCancelled ? (
              <span className="text-xl font-medium text-black/55">×</span>
            ) : (
              <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <h1 className={`text-3xl ${isCancelled ? 'text-black' : 'text-white'}`}
              style={{ fontWeight: 400, letterSpacing: '-0.96px' }}>
            {msg.title}
          </h1>
          <p className={`mt-2 text-base ${isCancelled ? 'text-black/50' : 'text-white/70'}`}
             style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
            {msg.desc}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <span className={`rounded-full px-4 py-1.5 font-mono text-sm uppercase tracking-[0.54px] ${isCancelled ? 'bg-black/[0.08] text-black' : 'bg-white/15 text-white'}`}>
              #{order.orderNumber}
            </span>
            <Badge color={statusColors[safeOrder.status]} className="px-3 py-1 text-sm">
              {safeOrder.status}
            </Badge>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="space-y-6">

          {/* Items */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-black/[0.08] px-6 py-4">
              <h2 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>Items Ordered</h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
                {order.items.length} item{order.items.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="divide-y divide-black/[0.06]">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-start gap-4 px-6 py-4">
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/[0.08] bg-black/[0.02]">
                    {getPrimaryPreview(item) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={getPrimaryPreview(item) ?? ''} alt="Your design" className="h-full w-full object-contain p-1" />
                    ) : (
                      <svg viewBox="0 0 200 220" className="h-8 w-8 text-black/[0.06]" fill="currentColor">
                        <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
                      </svg>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-base text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                      {item.productName}
                    </p>
                    <p className="text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
                      {item.variantLabel} × {item.quantity}
                    </p>

                    {getPositionAssets(item).length > 0 && (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {getPositionAssets(item).map((positionAsset) => (
                          <div key={positionAsset.id} className="rounded-lg border border-black/[0.08] bg-black/[0.02] p-3">
                            <div className="flex items-start gap-3">
                              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/[0.08]">
                                {positionAsset.uploadedAssetUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={positionAsset.uploadedAssetUrl}
                                    alt={`Design for ${formatPosition(positionAsset.position)}`}
                                    className="h-full w-full object-contain p-1"
                                  />
                                ) : (
                                  <svg viewBox="0 0 200 220" className="h-6 w-6 text-black/[0.06]" fill="currentColor">
                                    <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
                                  </svg>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="inline-flex items-center rounded-full border border-black/[0.08] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
                                  {formatPosition(positionAsset.position)}
                                </span>
                                {positionAsset.designNote && (
                                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    <span className="font-medium">Note: </span>{positionAsset.designNote}
                                  </div>
                                )}
                                {positionAsset.uploadedAssetUrl && (
                                  <div className="mt-2">
                                    <DownloadDesignButton url={positionAsset.uploadedAssetUrl} />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <span className="text-sm text-black" style={{ fontWeight: 540 }}>${item.lineTotal.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-black/[0.08] bg-black/[0.02] px-6 py-4">
              <span className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>Order Total</span>
              <span className="text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
                ${order.totalAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Shipping & Contact */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="card overflow-hidden">
              <div className="border-b border-black/[0.08] px-5 py-3.5">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">Shipping To</h2>
              </div>
              <div className="space-y-0.5 p-5 text-sm text-black/60" style={{ letterSpacing: '-0.14px' }}>
                <p className="text-black" style={{ fontWeight: 480 }}>{order.shippingAddress.fullName}</p>
                <p>{order.shippingAddress.addressLine1}</p>
                {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
                <p>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}</p>
                <p>{order.shippingAddress.country}</p>
                {order.shippingAddress.phone && <p className="text-black/55">{order.shippingAddress.phone}</p>}
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="border-b border-black/[0.08] px-5 py-3.5">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">Order Contact</h2>
              </div>
              <div className="space-y-3 p-5">
                <div className="text-sm" style={{ letterSpacing: '-0.14px' }}>
                  <p className="text-black" style={{ fontWeight: 480 }}>{order.customerName}</p>
                  <p className="text-black/55">{order.customerEmail}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Progress timeline */}
          {!isCancelled && (
            <div className="card p-5">
              <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">What happens next</h3>
              <div className="space-y-2">
                {[
                  { done: ['Paid', 'Reviewing', 'Confirmed', 'InProduction', 'Shipped', 'Delivered'].includes(safeOrder.status), text: 'Payment is confirmed' },
                  { done: ['Reviewing', 'Confirmed', 'InProduction', 'Shipped', 'Delivered'].includes(safeOrder.status), text: 'Artwork is reviewed by our team' },
                  { done: ['InProduction', 'Shipped', 'Delivered'].includes(safeOrder.status), text: 'Your T-shirt enters production' },
                  { done: ['Shipped', 'Delivered'].includes(safeOrder.status), text: 'Shipped via NZ Post' },
                  { done: safeOrder.status === 'Delivered', text: 'Delivered to your door' },
                ].map(({ done, text }) => (
                  <div key={text} className="flex items-center gap-2.5 text-sm">
                    <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${
                      done ? 'bg-black text-white' : 'border border-black/[0.15] bg-white text-black/25'
                    }`}>
                      {done ? '✓' : '·'}
                    </span>
                    <span className={done ? 'text-black' : 'text-black/55'} style={{ letterSpacing: '-0.14px' }}>
                      {text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/products" className="btn-black">Continue Shopping</Link>
            <Link href="/" className="btn-glass">Back to Home</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
