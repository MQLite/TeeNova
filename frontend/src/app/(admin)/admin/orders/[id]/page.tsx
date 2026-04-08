'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ordersApi } from '@/api/orders'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import type { Order, OrderStatus } from '@/types'

const statusColors: Record<OrderStatus, 'gray' | 'blue' | 'yellow' | 'green' | 'purple' | 'red'> = {
  Pending: 'yellow',
  Confirmed: 'blue',
  InProduction: 'purple',
  Shipped: 'blue',
  Delivered: 'green',
  Cancelled: 'red',
}

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['InProduction', 'Cancelled'],
  InProduction: ['Shipped'],
  Shipped: ['Delivered'],
  Delivered: [],
  Cancelled: [],
}

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    ordersApi.getById(id).then(setOrder).finally(() => setLoading(false))
  }, [id])

  async function handleStatusChange(newStatus: OrderStatus) {
    if (!order) return
    setUpdating(true)
    try {
      const updated = await ordersApi.updateStatus(order.id, newStatus)
      setOrder(updated)
    } finally {
      setUpdating(false)
    }
  }

  if (loading) return <div className="py-16 text-center text-gray-400">Loading…</div>
  if (!order) return <div className="py-16 text-center text-gray-400">Order not found.</div>

  const nextStatuses = STATUS_TRANSITIONS[order.status]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Order {order.orderNumber}</h1>
          <p className="text-sm text-gray-500">{new Date(order.creationTime).toLocaleString()}</p>
        </div>
        <Badge color={statusColors[order.status]} className="text-sm px-3 py-1">{order.status}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Items */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-900">Items</h2>
            </CardHeader>
            <CardBody className="divide-y divide-gray-100 p-0">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-start gap-4 px-6 py-4">
                  {item.uploadedAssetUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.uploadedAssetUrl}
                      alt="design"
                      className="h-20 w-20 rounded-lg border object-contain flex-shrink-0 bg-gray-50"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-lg border bg-gray-100 flex items-center justify-center text-gray-300 flex-shrink-0 text-3xl">
                      👕
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{item.productName}</p>
                    <p className="text-sm text-gray-500">{item.variantLabel}</p>
                    {item.printPosition && (
                      <p className="mt-0.5 text-xs text-brand-600">
                        Position: {item.printPosition.replace(/([A-Z])/g, ' $1').trim()}
                      </p>
                    )}
                    {item.uploadedAssetUrl && (
                      <a
                        href={item.uploadedAssetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs text-brand-600 hover:underline"
                      >
                        View design file ↗
                      </a>
                    )}
                    <p className="mt-1 text-sm text-gray-500">Qty: {item.quantity}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">${item.lineTotal.toFixed(2)}</p>
                    <p className="text-xs text-gray-400">${item.unitPrice.toFixed(2)} each</p>
                  </div>
                </div>
              ))}
              <div className="flex justify-between px-6 py-4 font-semibold text-gray-900 bg-gray-50">
                <span>Total</span>
                <span>${order.totalAmount.toFixed(2)}</span>
              </div>
            </CardBody>
          </Card>

          {/* Status actions */}
          {nextStatuses.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-gray-900">Update Status</h2>
              </CardHeader>
              <CardBody className="flex flex-wrap gap-3">
                {nextStatuses.map((s) => (
                  <Button
                    key={s}
                    variant={s === 'Cancelled' ? 'secondary' : 'primary'}
                    loading={updating}
                    onClick={() => handleStatusChange(s)}
                  >
                    Mark as {s}
                  </Button>
                ))}
              </CardBody>
            </Card>
          )}
        </div>

        {/* Right: Customer + Shipping */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-900">Customer</h2>
            </CardHeader>
            <CardBody className="space-y-1 text-sm">
              <p className="font-medium text-gray-900">{order.customerName}</p>
              <p className="text-gray-500">{order.customerEmail}</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-900">Shipping Address</h2>
            </CardHeader>
            <CardBody className="space-y-1 text-sm text-gray-700">
              <p className="font-medium">{order.shippingAddress.fullName}</p>
              <p>{order.shippingAddress.addressLine1}</p>
              {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
              <p>
                {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
                {order.shippingAddress.postalCode}
              </p>
              <p>{order.shippingAddress.country}</p>
              {order.shippingAddress.phone && (
                <p className="text-gray-500">{order.shippingAddress.phone}</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
