'use client'

import { useState } from 'react'
import Link from 'next/link'
import { OrderStatusBadge } from '@/components/admin/OrderStatusBadge'
import type { Order, OrderStatus } from '@/types'

const STATUS_TABS: { label: string; value: OrderStatus | 'All' }[] = [
  { label: 'All', value: 'All' },
  { label: 'Pending', value: 'Pending' },
  { label: 'Confirmed', value: 'Confirmed' },
  { label: 'In Production', value: 'InProduction' },
  { label: 'Shipped', value: 'Shipped' },
  { label: 'Delivered', value: 'Delivered' },
  { label: 'Cancelled', value: 'Cancelled' },
]

interface Props {
  orders: Order[]
}

export function OrdersTable({ orders }: Props) {
  const [activeTab, setActiveTab] = useState<OrderStatus | 'All'>('All')
  const [search, setSearch] = useState('')

  const filtered = orders.filter((o) => {
    const matchesTab = activeTab === 'All' || o.status === activeTab
    const q = search.toLowerCase()
    const matchesSearch =
      !q ||
      o.orderNumber.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.customerEmail.toLowerCase().includes(q)
    return matchesTab && matchesSearch
  })

  const countForTab = (tab: OrderStatus | 'All') =>
    tab === 'All' ? orders.length : orders.filter((o) => o.status === tab).length

  return (
    <div>
      {/* Status filter tabs */}
      <div className="mb-4 flex items-center gap-1 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={[
              'flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              activeTab === tab.value
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800',
            ].join(' ')}
          >
            {tab.label}
            <span className={[
              'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
              activeTab === tab.value ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500',
            ].join(' ')}>
              {countForTab(tab.value)}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            placeholder="Search orders…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-300"
          />
        </div>
        {(search || activeTab !== 'All') && (
          <button
            onClick={() => { setSearch(''); setActiveTab('All') }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-12 text-center text-sm text-gray-400">
          No orders match your filter.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['Order', 'Customer', 'Status', 'Items', 'Total', 'Date', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((order) => (
                <tr key={order.id} className="group transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-brand-600">
                      {order.orderNumber}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 leading-tight">{order.customerName}</p>
                    <p className="text-xs text-gray-400 leading-tight">{order.customerEmail}</p>
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    ${order.totalAmount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(order.creationTime).toLocaleDateString('en-NZ', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 opacity-0 transition-opacity hover:border-gray-300 hover:text-gray-900 group-hover:opacity-100"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
