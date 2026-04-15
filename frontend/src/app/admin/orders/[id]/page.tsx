'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ordersApi } from '@/api/orders'
import { filesApi } from '@/api/files'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { OrderStatusBadge, STATUS_CONFIG } from '@/components/admin/OrderStatusBadge'
import { SkeletonBlock } from '@/components/admin/LoadingSkeleton'
import { DownloadDesignButton } from '@/components/orders/DownloadDesignButton'
import type { Order, OrderItemPositionAsset, OrderStatus, PrintPosition } from '@/types'
import clsx from 'clsx'

const PIPELINE: OrderStatus[] = ['Pending', 'Confirmed', 'InProduction', 'Shipped', 'Delivered']

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  Pending: ['Confirmed', 'Cancelled'],
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
          'inline-flex items-center gap-1 rounded-lg border border-dashed transition-colors',
          compact ? 'w-full justify-center px-2 py-1 text-[10px]' : 'px-2.5 py-1 text-xs',
          uploading
            ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
            : 'border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100',
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
        <div className="col-span-full rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center text-sm text-gray-400">
          No position assets have been attached to this item yet.
        </div>
      )}
      {positions.map((p) => (
        <div key={p.position} className="rounded-lg border border-gray-100 bg-gray-50 p-2">
          {p.uploadedAssetUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.uploadedAssetUrl}
              alt={`Design for ${formatPosition(p.position)}`}
              className="mb-1.5 h-20 w-full rounded-md border border-gray-100 bg-white object-contain p-0.5"
            />
          ) : (
            <div className="mb-1.5 flex h-20 w-full items-center justify-center rounded-md border border-dashed border-gray-200 bg-white text-2xl">
              馃柤锔?
            </div>
          )}
          <p className="text-center text-[10px] font-semibold text-brand-700">
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
          <SkeletonBlock className="h-48 rounded-xl" />
          <SkeletonBlock className="h-24 rounded-xl" />
        </div>
        <div className="space-y-4">
          <SkeletonBlock className="h-32 rounded-xl" />
          <SkeletonBlock className="h-36 rounded-xl" />
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

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  if (loading) return <DetailSkeleton />

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-2xl font-bold text-gray-300">404</p>
        <p className="mt-1 text-sm text-gray-500">Order not found.</p>
        <Link href="/admin/orders" className="mt-4 text-sm text-brand-600 hover:underline">
          鈫?Back to Orders
        </Link>
      </div>
    )
  }

  const nextStatuses = TRANSITIONS[order.status]
  const cancelNext = nextStatuses.includes('Cancelled')
  const advanceNext = nextStatuses.filter((s) => s !== 'Cancelled')
  const isCancelled = order.status === 'Cancelled'
  const isTerminal = order.status === 'Delivered' || isCancelled
  const pipelineIdx = PIPELINE.indexOf(order.status)

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-xl">
          鉁?{toast}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-3">
        <Link href="/admin/orders" className="mt-0.5 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Orders
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold text-gray-900">{order.orderNumber}</h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="mt-0.5 text-xs text-gray-400">
            Placed {new Date(order.creationTime).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
      </div>

      {!isCancelled && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Order Progress</p>
          <div className="flex items-center">
            {PIPELINE.map((step, i) => {
              const done = i < pipelineIdx
              const active = i === pipelineIdx
              const cfg = STATUS_CONFIG[step]
              return (
                <div key={step} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={clsx(
                      'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
                      done ? 'bg-brand-600 text-white' : active ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-500' : 'bg-gray-100 text-gray-400',
                    )}>
                      {done ? '鉁?' : i + 1}
                    </div>
                    <span className={clsx(
                      'whitespace-nowrap text-[10px] font-medium',
                      active ? 'text-brand-700' : done ? 'text-gray-600' : 'text-gray-400',
                    )}>
                      {cfg.label}
                    </span>
                  </div>
                  {i < PIPELINE.length - 1 && (
                    <div className={clsx('mx-1 mb-5 h-px flex-1', i < pipelineIdx ? 'bg-brand-400' : 'bg-gray-200')} />
                  )}
                </div>
              )
            })}
          </div>

          {!isTerminal && (
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
              {advanceNext.map((s) => (
                <Button key={s} size="sm" loading={updating} onClick={() => handleStatusChange(s)}>
                  Mark as {STATUS_CONFIG[s]?.label ?? s} 鈫?
                </Button>
              ))}
              {cancelNext && (
                <Button size="sm" variant="secondary" loading={updating} onClick={() => handleStatusChange('Cancelled')}>
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
              <h2 className="font-semibold text-gray-900">Items</h2>
              <span className="text-xs text-gray-400">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
            </CardHeader>
            <CardBody className="p-0">
              <div className="divide-y divide-gray-50">
                {order.items.map((item) => (
                  <div key={item.id} className="px-6 py-5">
                    <div className="flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900">{item.productName}</p>
                        <p className="mt-0.5 text-sm text-gray-500">{item.variantLabel}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                            Qty {item.quantity}
                          </span>
                        </div>
                      </div>

                      <div className="flex-shrink-0 text-right">
                        <p className="font-bold text-gray-900">${(item.unitPrice * item.quantity).toFixed(2)}</p>
                        <p className="text-xs text-gray-400">${item.unitPrice.toFixed(2)} each</p>
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

              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-6 py-4">
                <span className="font-semibold text-gray-900">Order Total</span>
                <span className="text-lg font-bold text-gray-900">${order.totalAmount.toFixed(2)}</span>
              </div>
            </CardBody>
          </Card>

          {order.notes && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-gray-900">Order Notes</h2>
              </CardHeader>
              <CardBody>
                <p className="text-sm leading-relaxed text-gray-700">{order.notes}</p>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Customer</h2>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                  {order.customerName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{order.customerName}</p>
                  <p className="truncate text-xs text-gray-500">{order.customerEmail}</p>
                </div>
              </div>
              {order.shippingAddress.phone && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <svg className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {order.shippingAddress.phone}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Shipping Address</h2>
            </CardHeader>
            <CardBody>
              <address className="not-italic space-y-0.5 text-sm text-gray-700">
                <p className="font-medium text-gray-900">{order.shippingAddress.fullName}</p>
                <p>{order.shippingAddress.addressLine1}</p>
                {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
                <p>
                  {order.shippingAddress.city}
                  {order.shippingAddress.state ? `, ${order.shippingAddress.state}` : ''}
                  {order.shippingAddress.postalCode ? ` ${order.shippingAddress.postalCode}` : ''}
                </p>
                <p className="text-gray-500">{order.shippingAddress.country}</p>
              </address>
            </CardBody>
          </Card>

          {isCancelled && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-semibold">Order Cancelled</p>
              <p className="mt-0.5 text-xs text-red-500">This order has been cancelled and cannot be updated further.</p>
            </div>
          )}

          {order.status === 'Delivered' && (
            <div className="rounded-xl border border-green-100 bg-green-50 p-4 text-sm text-green-700">
              <p className="font-semibold">鉁?Delivered</p>
              <p className="mt-0.5 text-xs text-green-600">Order has been delivered successfully.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
