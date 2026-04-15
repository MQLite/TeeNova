import Link from 'next/link'
import { ordersApi } from '@/api/orders'
import { Badge } from '@/components/ui/Badge'
import { DownloadDesignButton } from '@/components/orders/DownloadDesignButton'
import type { OrderItem, OrderStatus } from '@/types'

export const metadata = { title: 'Order Confirmed' }

const statusColors: Record<OrderStatus, 'gray' | 'blue' | 'yellow' | 'green' | 'purple' | 'red'> = {
  Pending: 'yellow',
  Confirmed: 'blue',
  InProduction: 'purple',
  Shipped: 'blue',
  Delivered: 'green',
  Cancelled: 'red',
}

const statusMessages: Record<OrderStatus, { title: string; desc: string }> = {
  Pending: { title: 'Order received!', desc: 'We have received your order and will confirm it shortly.' },
  Confirmed: { title: 'Order confirmed!', desc: 'Your order has been confirmed and will enter production soon.' },
  InProduction: { title: 'Being printed!', desc: 'Your custom T-shirt is currently being printed.' },
  Shipped: { title: 'On its way!', desc: 'Your order has shipped and is heading to you.' },
  Delivered: { title: 'Delivered!', desc: 'Your order has been delivered. Enjoy your custom tee!' },
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

function getStatusIcon(status: OrderStatus) {
  switch (status) {
    case 'Cancelled':
      return 'X'
    case 'Delivered':
      return 'OK'
    case 'Shipped':
      return 'Go'
    default:
      return 'OK'
  }
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params
  const order = await ordersApi.getById(id)

  const status = (typeof order.status === 'number'
    ? (['Pending', 'Confirmed', 'InProduction', 'Shipped', 'Delivered', 'Cancelled'] as const)[order.status as unknown as number]
    : order.status) ?? 'Pending'
  const safeOrder = { ...order, status }

  const msg = statusMessages[safeOrder.status] ?? statusMessages.Pending

  return (
    <div className="min-h-screen bg-gray-50">
      <div className={`py-12 ${safeOrder.status === 'Cancelled' ? 'bg-gray-100' : 'bg-gradient-to-br from-brand-950 via-brand-800 to-brand-600'}`}>
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
            <span className="text-2xl font-bold text-white">{getStatusIcon(safeOrder.status)}</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white sm:text-4xl">{msg.title}</h1>
          <p className="mt-2 text-brand-200">{msg.desc}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <span className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-mono font-semibold text-white">
              #{order.orderNumber}
            </span>
            <Badge color={statusColors[safeOrder.status]} className="px-3 py-1 text-sm">{safeOrder.status}</Badge>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4">
              <h2 className="font-bold text-gray-900">Items Ordered</h2>
              <span className="text-xs text-gray-500">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-start gap-4 px-6 py-4">
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-gradient-to-br from-brand-50 to-purple-50">
                    {getPrimaryPreview(item) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getPrimaryPreview(item) ?? ''}
                        alt="Your design"
                        className="h-full w-full object-contain p-1"
                      />
                    ) : (
                      <svg viewBox="0 0 200 220" className="h-8 w-8 text-brand-200" fill="currentColor">
                        <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
                      </svg>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{item.productName}</p>
                    <p className="text-sm text-gray-500">{item.variantLabel} x {item.quantity}</p>

                    {getPositionAssets(item).length > 0 && (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {getPositionAssets(item).map((positionAsset) => (
                          <div key={positionAsset.id} className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
                            <div className="flex items-start gap-3">
                              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-gradient-to-br from-brand-50 to-purple-50">
                                {positionAsset.uploadedAssetUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={positionAsset.uploadedAssetUrl}
                                    alt={`Design for ${formatPosition(positionAsset.position)}`}
                                    className="h-full w-full object-contain p-1"
                                  />
                                ) : (
                                  <svg viewBox="0 0 200 220" className="h-8 w-8 text-brand-200" fill="currentColor">
                                    <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
                                  </svg>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                                      <path fillRule="evenodd" d="M8 1.5a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5V2a.5.5 0 01.5-.5z" clipRule="evenodd" />
                                    </svg>
                                    {formatPosition(positionAsset.position)}
                                  </span>
                                </div>
                                {positionAsset.designNote && (
                                  <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    <span className="font-semibold">Note: </span>{positionAsset.designNote}
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

                  <span className="text-sm font-bold text-gray-900">${item.lineTotal.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-gray-100 bg-gray-50 px-6 py-4 font-bold">
              <span className="text-gray-900">Order Total</span>
              <span className="text-lg text-brand-600">${order.totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
              <div className="border-b border-gray-100 bg-gray-50 px-5 py-3.5">
                <h2 className="text-sm font-bold text-gray-900">Shipping To</h2>
              </div>
              <div className="space-y-0.5 p-5 text-sm text-gray-700">
                <p className="font-semibold text-gray-900">{order.shippingAddress.fullName}</p>
                <p>{order.shippingAddress.addressLine1}</p>
                {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
                <p>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}</p>
                <p>{order.shippingAddress.country}</p>
                {order.shippingAddress.phone && <p className="text-gray-500">{order.shippingAddress.phone}</p>}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
              <div className="border-b border-gray-100 bg-gray-50 px-5 py-3.5">
                <h2 className="text-sm font-bold text-gray-900">Order Contact</h2>
              </div>
              <div className="space-y-3 p-5">
                <div className="text-sm">
                  <p className="font-semibold text-gray-900">{order.customerName}</p>
                  <p className="text-gray-500">{order.customerEmail}</p>
                </div>
                <div className="rounded-xl bg-brand-50 p-3 text-xs text-brand-700">
                  A confirmation email will be sent to <strong>{order.customerEmail}</strong>
                </div>
              </div>
            </div>
          </div>

          {safeOrder.status !== 'Cancelled' && (
            <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-purple-50 p-5">
              <h3 className="mb-3 font-bold text-brand-900">What happens next?</h3>
              <div className="space-y-2">
                {[
                  { done: ['Confirmed', 'InProduction', 'Shipped', 'Delivered'].includes(safeOrder.status), text: 'Order confirmed by our team' },
                  { done: ['InProduction', 'Shipped', 'Delivered'].includes(safeOrder.status), text: 'Your T-shirt enters production' },
                  { done: ['Shipped', 'Delivered'].includes(safeOrder.status), text: 'Shipped via NZ Post' },
                  { done: safeOrder.status === 'Delivered', text: 'Delivered to your door' },
                ].map(({ done, text }) => (
                  <div key={text} className="flex items-center gap-2.5 text-sm">
                    <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${done ? 'bg-brand-600 text-white' : 'border-2 border-brand-200 bg-white text-brand-400'}`}>
                      {done ? 'OK' : '...'}
                    </span>
                    <span className={done ? 'font-medium text-brand-900' : 'text-brand-600'}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/products"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              Continue Shopping
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
