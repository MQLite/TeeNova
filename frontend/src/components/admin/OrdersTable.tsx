'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { makeOrdersApi } from '@/api/orders'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import { OrderStatusBadge, STATUS_CONFIG } from '@/components/admin/OrderStatusBadge'
import type { Order, OrderStatus } from '@/types'

const ordersApi = makeOrdersApi(adminApiClient)

const STATUS_TAB_ORDER: OrderStatus[] = [
  'Pending',
  'Cancelled',
  'Paid',
  'Reviewing',
  'Printing',
  'Ready',
  'Completed',
]

const STATUS_TABS: { label: string; value: OrderStatus | 'All' }[] = [
  { label: 'All', value: 'All' },
  ...STATUS_TAB_ORDER.map((status) => ({
    label: STATUS_CONFIG[status].label,
    value: status,
  })),
]

interface Props {
  orders: Order[]
}

export function OrdersTable({ orders }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<OrderStatus | 'All'>('All')
  const [search, setSearch] = useState('')
  // Local copy so deleted rows disappear instantly; re-seeded when the server passes fresh data.
  const [rows, setRows] = useState<Order[]>(orders)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setRows(orders)
    setSelected(new Set())
  }, [orders])

  const filtered = rows.filter((o) => {
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
    tab === 'All' ? rows.length : rows.filter((o) => o.status === tab).length

  const filteredIds = filtered.map((o) => o.id)
  const allVisibleSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id))
  const someVisibleSelected = filteredIds.some((id) => selected.has(id))

  // Tri-state "select all" checkbox: indeterminate when only some visible rows are selected.
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected
  }, [someVisibleSelected, allVisibleSelected])

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) filteredIds.forEach((id) => next.delete(id))
      else filteredIds.forEach((id) => next.add(id))
      return next
    })
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkDelete() {
    const ids = [...selected]
    if (ids.length === 0) return
    const confirmed = window.confirm(
      `Permanently delete ${ids.length} order${ids.length !== 1 ? 's' : ''}? This removes each order ` +
      `and all of its timeline, payment and price-adjustment history. This cannot be undone.`,
    )
    if (!confirmed) return

    setDeleting(true)
    setError(null)
    try {
      const results = await Promise.allSettled(ids.map((id) => ordersApi.delete(id)))

      if (results.some((r) => r.status === 'rejected' && r.reason instanceof ApiError && r.reason.status === 401)) {
        redirectToLogin('session-expired')
        return
      }

      const succeededIds = ids.filter((_, i) => results[i].status === 'fulfilled')
      setRows((prev) => prev.filter((o) => !succeededIds.includes(o.id)))
      setSelected(new Set())

      const failedCount = results.length - succeededIds.length
      if (failedCount > 0) {
        setError(`${failedCount} order${failedCount !== 1 ? 's' : ''} could not be deleted.`)
      }
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }

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
            placeholder="Search orders..."
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

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/[0.08] bg-black/[0.02] px-4 py-2.5">
          <span className="text-sm text-black" style={{ letterSpacing: '-0.14px' }}>
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              disabled={deleting}
              className="rounded-[50px] border border-black/[0.08] px-3 py-1.5 text-xs text-black/50 transition-colors hover:border-black/20 hover:text-black disabled:opacity-40"
              style={{ letterSpacing: '-0.14px' }}
            >
              Clear selection
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={deleting}
              className="rounded-[50px] bg-red-600 px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-85 disabled:opacity-40"
              style={{ letterSpacing: '-0.14px' }}
            >
              {deleting ? 'Deleting…' : `Delete ${selected.size} selected`}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700" style={{ letterSpacing: '-0.14px' }}>
          {error}
        </div>
      )}

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
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Select all orders"
                    className="h-4 w-4 cursor-pointer accent-black"
                  />
                </th>
                {['Order', 'Customer', 'Status', 'Items', 'Total', 'Date', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {filtered.map((order) => (
                <tr
                  key={order.id}
                  className={[
                    'group transition-colors',
                    selected.has(order.id) ? 'bg-black/[0.03]' : 'hover:bg-black/[0.02]',
                  ].join(' ')}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(order.id)}
                      onChange={() => toggleOne(order.id)}
                      aria-label={`Select order ${order.orderNumber}`}
                      className="h-4 w-4 cursor-pointer accent-black"
                    />
                  </td>
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
                      View
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

