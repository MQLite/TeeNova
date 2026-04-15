import Link from 'next/link'
import { dashboardApi } from '@/api/dashboard'
import { SkeletonBlock } from '@/components/admin/LoadingSkeleton'
import { OrderStatusBadge, STATUS_CONFIG } from '@/components/admin/OrderStatusBadge'
import type { DashboardStats, DashboardRecentOrder, DashboardDailyCount, OrderStatus } from '@/types'
import type { ReactNode, CSSProperties } from 'react'

export const metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency', currency: 'NZD', maximumFractionDigits: 0,
  }).format(n)
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function SummaryCard({ label, value, sub, icon }: {
  label: string
  value: ReactNode
  sub?: string
  icon: ReactNode
}) {
  return (
    <div className="card p-5">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.05] text-black">
        {icon}
      </div>
      <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">{label}</p>
      <p className="mt-1 text-2xl text-black tabular-nums" style={{ fontWeight: 400, letterSpacing: '-0.96px' }}>{value}</p>
      {sub && <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">{sub}</p>}
    </div>
  )
}

function RecentOrdersWidget({ orders }: { orders: DashboardRecentOrder[] }) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-sm text-black/50" style={{ letterSpacing: '-0.14px' }}>No orders yet</p>
      </div>
    )
  }
  return (
    <div className="divide-y divide-black/[0.06]">
      {orders.map((order) => (
        <Link
          key={order.id}
          href={`/admin/orders/${order.id}`}
          className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-black/[0.02]"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-black" style={{ fontWeight: 540 }}>
                #{order.orderNumber}
              </span>
              <OrderStatusBadge status={order.status as OrderStatus} size="sm" />
            </div>
            <p className="truncate text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>
              {order.customerName}
              {order.itemCount > 1 && (
                <span className="ml-1 text-black/25">· {order.itemCount} items</span>
              )}
            </p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
              {fmtCurrency(order.totalAmount)}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
              {timeAgo(order.creationTime)}
            </p>
          </div>
          <svg className="h-3.5 w-3.5 flex-shrink-0 text-black/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      ))}
    </div>
  )
}

function QuickLinkCard({ href, label, description, icon }: {
  href: string
  label: string
  description: string
  icon: ReactNode
}) {
  return (
    <Link
      href={href}
      className="group card flex items-center gap-3.5 p-4 transition-shadow hover:shadow-card"
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-black transition-colors group-hover:bg-black group-hover:text-white">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>{label}</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/50">{description}</p>
      </div>
      <svg className="h-4 w-4 flex-shrink-0 text-black/20 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

const BAR_COLORS: Record<string, string> = {
  Pending:      'bg-amber-400',
  Confirmed:    'bg-blue-400',
  InProduction: 'bg-violet-500',
  Shipped:      'bg-sky-400',
  Delivered:    'bg-green-400',
  Cancelled:    'bg-red-400',
}
const STATUS_ORDER = ['Pending', 'Confirmed', 'InProduction', 'Shipped', 'Delivered', 'Cancelled']

function StatusDistributionChart({ ordersByStatus }: { ordersByStatus: Record<string, number> }) {
  const total = Object.values(ordersByStatus).reduce((a, b) => a + b, 0)
  if (total === 0) return <p className="py-8 text-center font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">No order data yet</p>

  const sorted = STATUS_ORDER
    .filter((s) => (ordersByStatus[s] ?? 0) > 0)
    .map((s) => ({ status: s, count: ordersByStatus[s] ?? 0 }))

  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-black/[0.06]">
        {sorted.map(({ status, count }) => (
          <div
            key={status}
            title={`${status}: ${count}`}
            className={`${BAR_COLORS[status] ?? 'bg-black/30'} transition-all`}
            style={{ width: `${(count / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-4 space-y-2.5">
        {sorted.map(({ status, count }) => {
          const cfg = STATUS_CONFIG[status as OrderStatus]
          return (
            <div key={status} className="flex items-center gap-2">
              <div className={`h-2 w-2 flex-shrink-0 rounded-full ${BAR_COLORS[status] ?? 'bg-black/30'}`} />
              <span className="flex-1 text-xs text-black/60" style={{ letterSpacing: '-0.14px' }}>
                {cfg?.label ?? status}
              </span>
              <span className="font-mono text-xs text-black tabular-nums" style={{ fontWeight: 540 }}>{count}</span>
              <span className="w-9 text-right font-mono text-[10px] uppercase tracking-[0.54px] text-black/50 tabular-nums">
                {Math.round((count / total) * 100)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TrendChart({ dailyCounts }: { dailyCounts: DashboardDailyCount[] }) {
  const max = Math.max(...dailyCounts.map((d) => d.count), 1)
  return (
    <div>
      <div className="flex items-end justify-between gap-1.5" style={{ height: '96px' }}>
        {dailyCounts.map((d) => (
          <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1">
            {d.count > 0 && (
              <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/50">{d.count}</span>
            )}
            <div
              className={`w-full rounded-t-sm transition-all ${d.count > 0 ? 'bg-black' : 'bg-black/[0.06]'}`}
              style={{ height: d.count > 0 ? `${Math.max((d.count / max) * 80, 6)}px` : '4px' } as CSSProperties}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between gap-1.5">
        {dailyCounts.map((d) => (
          <span key={d.date} className="flex-1 text-center font-mono text-[9px] uppercase tracking-[0.54px] text-black/45">
            {d.date}
          </span>
        ))}
      </div>
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4">
        <h2 className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

export default async function AdminDashboardPage() {
  let stats: DashboardStats | null = null
  try {
    stats = await dashboardApi.getSummary()
  } catch {
    // Backend unreachable — show skeleton state gracefully
  }

  const pendingCount =
    (stats?.ordersByStatus['Pending'] ?? 0) + (stats?.ordersByStatus['Confirmed'] ?? 0)

  const today = new Date().toLocaleDateString('en-NZ', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div className="admin-page admin-stack">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>Dashboard</h1>
          <p className="mt-0.5 text-sm text-black/55" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
            Monitor orders and operations for Otahuhu Printing
          </p>
        </div>
        <span className="flex-shrink-0 rounded-full border border-black/[0.10] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
          {today}
        </span>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="Total Orders"
          value={stats?.totalOrders ?? <SkeletonBlock className="mt-1 h-7 w-14" />}
          sub={stats ? `${stats.ordersThisMonth} this month` : undefined}
          icon={<svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
          </svg>}
        />
        <SummaryCard
          label="Needs Attention"
          value={stats ? pendingCount : <SkeletonBlock className="mt-1 h-7 w-14" />}
          sub={stats ? 'Pending or confirmed' : undefined}
          icon={<svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>}
        />
        <SummaryCard
          label="In Production"
          value={stats ? (stats.ordersByStatus['InProduction'] ?? 0) : <SkeletonBlock className="mt-1 h-7 w-14" />}
          sub={stats ? 'Currently printing' : undefined}
          icon={<svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 3V5h6v2H7zm-1 5a1 1 0 100-2 1 1 0 000 2zm8-1a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
          </svg>}
        />
        <SummaryCard
          label="Total Revenue"
          value={stats ? fmtCurrency(stats.totalRevenue) : <SkeletonBlock className="mt-1 h-7 w-20" />}
          sub={stats ? `${fmtCurrency(stats.revenueThisMonth)} this month` : undefined}
          icon={<svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
          </svg>}
        />
      </div>

      {/* ── Middle: Recent orders + Quick links ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section
            title="Recent Orders"
            action={
              <Link href="/admin/orders" className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55 hover:text-black transition-colors">
                View all →
              </Link>
            }
          >
            {stats ? (
              <RecentOrdersWidget orders={stats.recentOrders} />
            ) : (
              <div className="divide-y divide-black/[0.06]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                    <SkeletonBlock className="h-4 w-24" />
                    <SkeletonBlock className="h-4 flex-1" />
                    <SkeletonBlock className="h-5 w-16 rounded-full" />
                    <SkeletonBlock className="h-4 w-12" />
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">Quick Access</h2>

          <QuickLinkCard
            href="/admin/orders"
            label="Orders"
            description={stats ? `${stats.totalOrders} total orders` : 'Manage customer orders'}
            icon={<svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>}
          />
          <QuickLinkCard
            href="/admin/products"
            label="Products"
            description={stats ? `${stats.activeProducts} active products` : 'Manage your catalogue'}
            icon={<svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4z" clipRule="evenodd" />
            </svg>}
          />
          <QuickLinkCard
            href="/admin/assets"
            label="Design Assets"
            description="Browse uploaded artwork"
            icon={<svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
            </svg>}
          />

          {stats && stats.lowStockVariants > 0 && (
            <div className="card border-amber-200 bg-amber-50 px-4 py-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-amber-700">
                ⚠ {stats.lowStockVariants} variant{stats.lowStockVariants !== 1 ? 's' : ''} low on stock
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Order Status Distribution">
          <div className="px-5 py-4">
            {stats ? (
              <StatusDistributionChart ordersByStatus={stats.ordersByStatus} />
            ) : (
              <div className="space-y-3">
                <SkeletonBlock className="h-2 w-full rounded-full" />
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <SkeletonBlock className="h-2 w-2 rounded-full" />
                    <SkeletonBlock className="h-3 flex-1" />
                    <SkeletonBlock className="h-3 w-8" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        <Section title="Orders — Last 7 Days">
          <div className="px-5 py-4">
            {stats?.dailyOrderCounts.length ? (
              <TrendChart dailyCounts={stats.dailyOrderCounts} />
            ) : (
              <div className="flex items-end justify-between gap-1.5" style={{ height: '96px' }}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 animate-pulse rounded-t-sm bg-black/[0.06]"
                    style={{ height: `${20 + i * 10}%` } as CSSProperties}
                  />
                ))}
              </div>
            )}
          </div>
        </Section>
      </div>

    </div>
  )
}
