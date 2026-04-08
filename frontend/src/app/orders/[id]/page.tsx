import Link from 'next/link'
import { ordersApi } from '@/api/orders'
import { Badge } from '@/components/ui/Badge'
import type { OrderStatus } from '@/types'

export const metadata = { title: 'Order Confirmed' }

const statusColors: Record<OrderStatus, 'gray' | 'blue' | 'yellow' | 'green' | 'purple' | 'red'> = {
  Pending:      'yellow',
  Confirmed:    'blue',
  InProduction: 'purple',
  Shipped:      'blue',
  Delivered:    'green',
  Cancelled:    'red',
}

const statusMessages: Record<OrderStatus, { title: string; desc: string }> = {
  Pending:      { title: "Order received!", desc: "We've received your order and will confirm it shortly." },
  Confirmed:    { title: "Order confirmed!", desc: "Your order has been confirmed and will enter production soon." },
  InProduction: { title: "Being printed!", desc: "Your custom T-shirt is currently being printed." },
  Shipped:      { title: "On its way!", desc: "Your order has shipped and is heading to you." },
  Delivered:    { title: "Delivered!", desc: "Your order has been delivered. Enjoy your custom tee!" },
  Cancelled:    { title: "Order cancelled", desc: "This order has been cancelled." },
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params
  const order = await ordersApi.getById(id)
  const msg = statusMessages[order.status]

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Success banner */}
      <div className={`py-12 ${order.status === 'Cancelled' ? 'bg-gray-100' : 'bg-gradient-to-br from-brand-950 via-brand-800 to-brand-600'}`}>
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
            <span className="text-4xl">
              {order.status === 'Cancelled' ? '❌' :
               order.status === 'Delivered' ? '🎉' :
               order.status === 'Shipped' ? '🚚' : '✅'}
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-white sm:text-4xl">{msg.title}</h1>
          <p className="mt-2 text-brand-200">{msg.desc}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <span className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-mono font-semibold text-white">
              #{order.orderNumber}
            </span>
            <Badge color={statusColors[order.status]} className="px-3 py-1 text-sm">{order.status}</Badge>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="space-y-6">

          {/* Items */}
          <div className="rounded-2xl bg-white border border-gray-100  overflow-hidden">
            <div className="border-b border-gray-100 bg-gray-50 px-6 py-4 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Items Ordered</h2>
              <span className="text-xs text-gray-500">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-start gap-4 px-6 py-4">
                  {/* Design thumbnail */}
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center">
                    {item.uploadedAssetUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.uploadedAssetUrl}
                        alt="Your design"
                        className="h-full w-full object-contain p-1"
                      />
                    ) : (
                      <svg viewBox="0 0 200 220" className="h-8 w-8 text-brand-200" fill="currentColor">
                        <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{item.productName}</p>
                    <p className="text-sm text-gray-500">{item.variantLabel} · ×{item.quantity}</p>
                    {item.printPosition && (
                      <span className="mt-1 inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                        📍 {item.printPosition.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-gray-900">${item.lineTotal.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 bg-gray-50 px-6 py-4 flex justify-between font-bold">
              <span className="text-gray-900">Order Total</span>
              <span className="text-lg text-brand-600">${order.totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Shipping */}
            <div className="rounded-2xl bg-white border border-gray-100  overflow-hidden">
              <div className="border-b border-gray-100 bg-gray-50 px-5 py-3.5">
                <h2 className="font-bold text-gray-900 text-sm">📦 Shipping To</h2>
              </div>
              <div className="p-5 text-sm text-gray-700 space-y-0.5">
                <p className="font-semibold text-gray-900">{order.shippingAddress.fullName}</p>
                <p>{order.shippingAddress.addressLine1}</p>
                {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
                <p>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}</p>
                <p>{order.shippingAddress.country}</p>
                {order.shippingAddress.phone && <p className="text-gray-500">{order.shippingAddress.phone}</p>}
              </div>
            </div>

            {/* Contact */}
            <div className="rounded-2xl bg-white border border-gray-100  overflow-hidden">
              <div className="border-b border-gray-100 bg-gray-50 px-5 py-3.5">
                <h2 className="font-bold text-gray-900 text-sm">📧 Order Contact</h2>
              </div>
              <div className="p-5 space-y-3">
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

          {/* What's next */}
          {order.status !== 'Cancelled' && (
            <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-purple-50 p-5">
              <h3 className="font-bold text-brand-900 mb-3">What happens next?</h3>
              <div className="space-y-2">
                {[
                  { done: ['Confirmed','InProduction','Shipped','Delivered'].includes(order.status), text: 'Order confirmed by our team' },
                  { done: ['InProduction','Shipped','Delivered'].includes(order.status), text: 'Your T-shirt enters production' },
                  { done: ['Shipped','Delivered'].includes(order.status), text: 'Shipped via NZ Post' },
                  { done: order.status === 'Delivered', text: 'Delivered to your door' },
                ].map(({ done, text }) => (
                  <div key={text} className="flex items-center gap-2.5 text-sm">
                    <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold
                      ${done ? 'bg-brand-600 text-white' : 'bg-white border-2 border-brand-200 text-brand-400'}`}>
                      {done ? '✓' : '○'}
                    </span>
                    <span className={done ? 'text-brand-900 font-medium' : 'text-brand-600'}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/products"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shadow-sm"
            >
              Continue Shopping
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
