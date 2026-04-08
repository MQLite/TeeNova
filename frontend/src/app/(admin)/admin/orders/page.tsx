import Link from 'next/link'
import { ordersApi } from '@/api/orders'
import { Badge } from '@/components/ui/Badge'
import type { OrderStatus } from '@/types'

export const metadata = { title: 'Orders' }

const statusColors: Record<OrderStatus, 'gray' | 'blue' | 'yellow' | 'green' | 'purple' | 'red'> = {
  Pending: 'yellow',
  Confirmed: 'blue',
  InProduction: 'purple',
  Shipped: 'blue',
  Delivered: 'green',
  Cancelled: 'red',
}

export default async function AdminOrdersPage() {
  const { items: orders, totalCount } = await ordersApi.getList({ maxResultCount: 50 })

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <span className="text-sm text-gray-500">{totalCount} total</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Order #', 'Customer', 'Status', 'Items', 'Total', 'Date'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-3 font-mono font-medium text-brand-600">
                  <Link href={`/admin/orders/${order.id}`} className="hover:underline">
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  <Link href={`/admin/orders/${order.id}`} className="block">
                    <span className="font-medium">{order.customerName}</span>
                    <span className="block text-xs text-gray-400">{order.customerEmail}</span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Badge color={statusColors[order.status]}>{order.status}</Badge>
                </td>
                <td className="px-4 py-3 text-gray-500">{order.items.length}</td>
                <td className="px-4 py-3 font-semibold">${order.totalAmount.toFixed(2)}</td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(order.creationTime).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-gray-400">No orders yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
