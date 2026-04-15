'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ordersApi } from '@/api/orders'
import { filesApi } from '@/api/files'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { OrderActionPanel } from '@/components/admin/OrderActionPanel'
import { OrderStatusBadge, STATUS_CONFIG } from '@/components/admin/OrderStatusBadge'
import { SkeletonBlock } from '@/components/admin/LoadingSkeleton'
import { DownloadDesignButton } from '@/components/orders/DownloadDesignButton'
import type { Order, OrderItemPositionAsset, OrderStatus, PrintPosition } from '@/types'
import clsx from 'clsx'

const PIPELINE: OrderStatus[] = ['Pending', 'Paid', 'Reviewing', 'InProduction', 'Shipped', 'Delivered']

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  Pending: ['Paid', 'Cancelled'],
  Paid: ['Reviewing', 'Cancelled'],
  Reviewing: ['InProduction', 'Cancelled'],
  // Legacy path kept for existing seeded/demo orders
  Confirmed: ['InProduction', 'Cancelled'],
  InProduction: ['Shipped'],
  Shipped: ['Delivered'],
  Delivered: [],
  Cancelled: [],
}

function formatPosition(pos: string) {
  return pos.replace(/([A-Z])/g, ' $1').trim()
}

function getPositionAssets(positions?: OrderItemPositionAsset[]) {
  return positions ?? []
}

function ReplaceDesignButton({
  onUploaded,
  compact = false,
}: {
  onUploaded: (assetId: string, assetUrl: string) => Promise<void>
  compact?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const result = await filesApi.upload(file)
      await onUploaded(result.assetId, result.fileUrl)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*,.pdf,.ai,.svg" className="hidden" onChange={handleChange} />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          'inline-flex items-center gap-1 rounded-[50px] border border-dashed transition-colors',
          compact ? 'w-full justify-center px-2 py-1 text-[10px]' : 'px-2.5 py-1 text-xs',
          uploading
            ? 'cursor-not-allowed border-black/[0.10] bg-black/[0.03] text-black/45'
            : 'border-black/[0.15] text-black/50 hover:border-black/30 hover:text-black',
        )}
      >
        {uploading ? (
          <>
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Uploading...
          </>
        ) : (
          <>
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Replace
          </>
        )}
      </button>
    </>
  )
}

function PositionCards({
  positions: initialPositions,
  onReplacePosition,
}: {
  positions: OrderItemPositionAsset[]
  onReplacePosition?: (position: string, assetId: string, assetUrl: string) => Promise<void>
}) {
  const [positions, setPositions] = useState<OrderItemPositionAsset[]>(getPositionAssets(initialPositions))

  useEffect(() => {
    setPositions(getPositionAssets(initialPositions))
  }, [initialPositions])

  async function handleReplace(position: string, assetId: string, assetUrl: string) {
    await onReplacePosition?.(position, assetId, assetUrl)
    setPositions((prev) =>
      prev.map((p) => p.position === position
        ? { ...p, uploadedAssetId: assetId, uploadedAssetUrl: assetUrl }
        : p),
    )
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {!positions.length && (
        <div className="col-span-full rounded-lg border border-dashed border-black/[0.12] bg-black/[0.02] px-4 py-5 text-center font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
          No position assets attached yet.
        </div>
      )}
      {positions.map((p) => (
        <div key={p.position} className="rounded-lg border border-black/[0.08] bg-black/[0.02] p-2">
          {p.uploadedAssetUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.uploadedAssetUrl}
              alt={`Design for ${formatPosition(p.position)}`}
              className="mb-1.5 h-20 w-full rounded border border-black/[0.08] bg-white object-contain p-0.5"
            />
          ) : (
            <div className="mb-1.5 flex h-20 w-full items-center justify-center rounded border border-dashed border-black/[0.10] bg-white text-black/20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          <p className="text-center font-mono text-[10px] uppercase tracking-[0.54px] text-black/50">
            {formatPosition(p.position)}
          </p>
          {p.designNote && (
            <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-amber-700">{p.designNote}</p>
          )}
          <div className="mt-1.5 flex flex-col gap-1">
            {p.uploadedAssetUrl && <DownloadDesignButton url={p.uploadedAssetUrl} />}
            {onReplacePosition && (
              <ReplaceDesignButton
                compact
                onUploaded={(assetId, assetUrl) => handleReplace(p.position, assetId, assetUrl)}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-4 w-20" />
        <SkeletonBlock className="h-7 w-48" />
        <SkeletonBlock className="ml-auto h-6 w-24 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SkeletonBlock className="h-48 rounded-lg" />
          <SkeletonBlock className="h-24 rounded-lg" />
        </div>
        <div className="space-y-4">
          <SkeletonBlock className="h-32 rounded-lg" />
          <SkeletonBlock className="h-36 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success')

  useEffect(() => {
    ordersApi.getById(id).then(setOrder).finally(() => setLoading(false))
  }, [id])

  async function handlePositionDesignUpdate(
    itemId: string,
    position: PrintPosition,
    assetId: string,
    assetUrl: string,
  ) {
    if (!order) return
    await ordersApi.updateItemDesign(order.id, itemId, {
      position,
      uploadedAssetId: assetId,
      uploadedAssetUrl: assetUrl,
    })
    setOrder((prev) =>
      prev ? {
        ...prev,
        items: prev.items.map((i) =>
          i.id === itemId ? {
            ...i,
            positionAssets: getPositionAssets(i.positionAssets).map((p) =>
              p.position === position
                ? { ...p, uploadedAssetId: assetId, uploadedAssetUrl: assetUrl }
                : p,
            ),
          } : i,
        ),
      } : prev,
    )
    showToast('Design updated')
  }

  async function handleStatusChange(newStatus: OrderStatus) {
    if (!order) return
    setUpdating(true)
    try {
      await ordersApi.updateStatus(order.id, newStatus)
      setOrder((prev) => prev ? { ...prev, status: newStatus } : prev)
      showToast(`Status updated to ${STATUS_CONFIG[newStatus]?.label ?? newStatus}`)
    } finally {
      setUpdating(false)
    }
  }

  async function handleMarkPaid() {
    if (!order) return
    setUpdating(true)
    try {
      const updated = await ordersApi.markPaid(order.id)
      setOrder(updated)
      showToast('Payment recorded')
    } finally {
      setUpdating(false)
    }
  }

  async function handleStartReview() {
    if (!order) return
    setUpdating(true)
    try {
      const updated = await ordersApi.startReview(order.id)
      setOrder(updated)
      showToast('Review started')
    } finally {
      setUpdating(false)
    }
  }

  async function handleReopen() {
    if (!order) return
    setUpdating(true)
    try {
      const updated = await ordersApi.reopen(order.id)
      setOrder(updated)
      showToast('Order reopened and returned to pending')
    } catch {
      showToast('This order can no longer be reopened', 'error')
    } finally {
      setUpdating(false)
    }
  }

  function showToast(msg: string, tone: 'success' | 'error' = 'success') {
    setToastTone(tone)
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  if (loading) return <DetailSkeleton />

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-4xl text-black/15" style={{ fontWeight: 320, letterSpacing: '-1.72px' }}>404</p>
        <p className="mt-1 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>Order not found.</p>
        <Link href="/admin/orders" className="mt-4 text-sm text-black/50 underline underline-offset-2 hover:text-black transition-colors"
              style={{ letterSpacing: '-0.14px' }}>
          Back to Orders
        </Link>
      </div>
    )
  }

  const nextStatuses = TRANSITIONS[order.status]
  const cancelNext = nextStatuses.includes('Cancelled')
  const advanceNext = nextStatuses.filter((s) => s !== 'Cancelled')
  const isCancelled = order.status === 'Cancelled'
  const isTerminal = order.status === 'Delivered' || isCancelled
  const progressStatus = order.status === 'Confirmed' ? 'Reviewing' : order.status
  const pipelineIdx = PIPELINE.indexOf(progressStatus)
  const showLifecycleActions = !['Pending', 'Paid'].includes(order.status)

  return (
    <div className="admin-page admin-stack">
      {toast && (
        <div className={clsx(
          'fixed bottom-6 right-6 z-50 rounded-[50px] px-5 py-2.5 text-sm text-white shadow-elevated',
          toastTone === 'success' ? 'bg-black' : 'bg-red-600',
        )}>
          {toastTone === 'success' ? 'Success: ' : 'Error: '}
          {toast}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-3">
        <Link href="/admin/orders"
          className="mt-0.5 flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50 hover:text-black transition-colors">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Orders
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
              {order.orderNumber}
            </h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
            Placed {new Date(order.creationTime).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
      </div>

      {!isCancelled && (
        <OrderActionPanel
          status={order.status}
          loading={updating}
          onMarkPaid={handleMarkPaid}
          onStartReview={handleStartReview}
        />
      )}

      {!isCancelled && (
        <div className="card p-5">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">Order Progress</p>
          <div className="flex items-center">
            {PIPELINE.map((step, i) => {
              const done = i < pipelineIdx
              const active = i === pipelineIdx
              const cfg = STATUS_CONFIG[step]
              return (
                <div key={step} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={clsx(
                      'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors',
                      done ? 'bg-black text-white' : active ? 'border-2 border-black bg-white text-black' : 'bg-black/[0.06] text-black/45',
                    )}>
                      {done ? 'OK' : i + 1}
                    </div>
                    <span className={clsx(
                      'whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.54px]',
                      active ? 'text-black' : done ? 'text-black/50' : 'text-black/25',
                    )}>
                      {cfg.label}
                    </span>
                  </div>
                  {i < PIPELINE.length - 1 && (
                    <div className={clsx('mx-1 mb-5 h-px flex-1', i < pipelineIdx ? 'bg-black' : 'bg-black/[0.10]')} />
                  )}
                </div>
              )
            })}
          </div>

          {!isTerminal && showLifecycleActions && (
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-black/[0.08] pt-4">
              {advanceNext.map((s) => (
                <Button key={s} size="sm" loading={updating} onClick={() => handleStatusChange(s)}>
                  Mark as {STATUS_CONFIG[s]?.label ?? s}
                </Button>
              ))}
              {cancelNext && (
                <Button size="sm" variant="glass" loading={updating} onClick={() => handleStatusChange('Cancelled')}>
                  Cancel Order
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>Items</h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
                {order.items.length} item{order.items.length !== 1 ? 's' : ''}
              </span>
            </CardHeader>
            <CardBody className="p-0">
              <div className="divide-y divide-black/[0.06]">
                {order.items.map((item) => (
                  <div key={item.id} className="px-6 py-5">
                    <div className="flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                          {item.productName}
                        </p>
                        <p className="mt-0.5 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
                          {item.variantLabel}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="inline-flex items-center rounded-full border border-black/[0.08] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
                            Qty {item.quantity}
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm text-black" style={{ fontWeight: 540 }}>${(item.unitPrice * item.quantity).toFixed(2)}</p>
                        <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">${item.unitPrice.toFixed(2)} each</p>
                      </div>
                    </div>
                    <PositionCards
                      positions={item.positionAssets}
                      onReplacePosition={async (position, assetId, assetUrl) =>
                        handlePositionDesignUpdate(item.id, position as PrintPosition, assetId, assetUrl)
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-black/[0.08] bg-black/[0.02] px-6 py-4">
                <span className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>Order Total</span>
                <span className="text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
                  ${order.totalAmount.toFixed(2)}
                </span>
              </div>
            </CardBody>
          </Card>

          {order.notes && (
            <Card>
              <CardHeader>
                <h2 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>Order Notes</h2>
              </CardHeader>
              <CardBody>
                <p className="text-sm leading-relaxed text-black/60" style={{ letterSpacing: '-0.14px' }}>{order.notes}</p>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">Customer</h2>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-black text-sm font-medium text-white">
                  {order.customerName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                    {order.customerName}
                  </p>
                  <p className="truncate text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>
                    {order.customerEmail}
                  </p>
                </div>
              </div>
              {order.shippingAddress.phone && (
                <div className="flex items-center gap-1.5 text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>
                  <svg className="h-3.5 w-3.5 flex-shrink-0 text-black/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {order.shippingAddress.phone}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">Shipping Address</h2>
            </CardHeader>
            <CardBody>
              <address className="not-italic space-y-0.5 text-sm text-black/60" style={{ letterSpacing: '-0.14px' }}>
                <p className="text-black" style={{ fontWeight: 480 }}>{order.shippingAddress.fullName}</p>
                <p>{order.shippingAddress.addressLine1}</p>
                {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
                <p>
                  {order.shippingAddress.city}
                  {order.shippingAddress.state ? `, ${order.shippingAddress.state}` : ''}
                  {order.shippingAddress.postalCode ? ` ${order.shippingAddress.postalCode}` : ''}
                </p>
                <p className="text-black/50">{order.shippingAddress.country}</p>
              </address>
            </CardBody>
          </Card>

          {isCancelled && (
            <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p style={{ fontWeight: 480 }}>Order Cancelled</p>
              <p className="mt-0.5 text-xs text-red-500">
                This order can be reopened within 24 hours and will return to pending.
              </p>
              <div className="mt-3">
                <Button size="sm" variant="white" loading={updating} onClick={handleReopen}>
                  Re-open Order
                </Button>
              </div>
            </div>
          )}

          {order.status === 'Delivered' && (
            <div className="card border-green-200 bg-green-50 p-4 text-sm text-green-700">
              <p style={{ fontWeight: 480 }}>Delivered</p>
              <p className="mt-0.5 text-xs text-green-600">Order has been delivered successfully.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

