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
      <div className="mb-4 flex items-center gap-1 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={[
              'flex-shrink-0 rounded-[50px] px-4 py-2 text-sm transition-all',
              activeTab === tab.value
                ? 'bg-black text-white shadow-sm'
                : 'border border-black/[0.08] bg-white text-black/50 hover:border-black/20 hover:text-black',
            ].join(' ')}
            style={{ letterSpacing: '-0.14px' }}
          >
            {tab.label}
            <span className={[
              'ml-1.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px]',
              activeTab === tab.value ? 'bg-white/20 text-white' : 'bg-black/[0.06] text-black/55',
            ].join(' ')}>
              {countForTab(tab.value)}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="admin-toolbar mb-4">
        <div className="relative w-full max-w-sm">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-black/45" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            placeholder="Search orders…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-[50px] border border-black/[0.12] bg-white py-1.5 pl-9 pr-3 text-sm text-black placeholder:text-black/45 focus:border-black focus:outline-none"
            style={{ letterSpacing: '-0.14px' }}
          />
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          {(search || activeTab !== 'All') && (
            <button
              onClick={() => { setSearch(''); setActiveTab('All') }}
              className="rounded-[50px] border border-black/[0.08] px-3 py-1.5 text-xs text-black/50 transition-colors hover:border-black/20 hover:text-black"
              style={{ letterSpacing: '-0.14px' }}
            >
              Clear
            </button>
          )}
          <span className="rounded-full bg-black/[0.04] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/50">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/[0.12] py-12 text-center font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
          No orders match your filter.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-black/[0.06] text-sm">
            <thead>
              <tr className="bg-black/[0.02]">
                {['Order', 'Customer', 'Status', 'Items', 'Total', 'Date', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {filtered.map((order) => (
                <tr key={order.id} className="group transition-colors hover:bg-black/[0.02]">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-black" style={{ fontWeight: 540 }}>
                      {order.orderNumber}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-black leading-tight" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                      {order.customerName}
                    </p>
                    <p className="text-xs text-black/50 leading-tight" style={{ letterSpacing: '-0.14px' }}>
                      {order.customerEmail}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-black/55" style={{ letterSpacing: '-0.14px' }}>
                    {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3 text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                    ${order.totalAmount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                    {new Date(order.creationTime).toLocaleDateString('en-NZ', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="rounded-[50px] border border-black/[0.10] bg-white px-3 py-1 text-xs text-black/50 opacity-0 transition-opacity hover:border-black/25 hover:text-black group-hover:opacity-100"
                      style={{ letterSpacing: '-0.14px' }}
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
