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
import { ImageZoomModal } from '@/components/admin/ImageZoomModal'
import { NotesPanel } from '@/components/admin/NotesPanel'
import { OrderTimeline } from '@/components/admin/OrderTimeline'
import { FulfillmentPanel } from '@/components/admin/FulfillmentPanel'
import { CompletionBanner } from '@/components/admin/CompletionBanner'
import { FileInfoCard } from '@/components/admin/FileInfoCard'
import { PreparationChecklist } from '@/components/admin/PreparationChecklist'
import { NotificationPanel } from '@/components/admin/NotificationPanel'
import { DownloadDesignButton } from '@/components/orders/DownloadDesignButton'
import type { Order, OrderItemPositionAsset, OrderStatus, PrintPosition } from '@/types'
import clsx from 'clsx'

// ── Constants ─────────────────────────────────────────────────────────────────

const PIPELINE: OrderStatus[] = ['Pending', 'Paid', 'Reviewing', 'Printing', 'Ready', 'Completed']

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  Pending:      ['Paid', 'Cancelled'],
  Cancelled:    [],
  Paid:         ['Reviewing', 'Cancelled'],
  Reviewing:    [],                           // handled by approve/start-printing flow
  Printing:     [],                           // handled by mark-ready flow
  Ready:        [],                           // handled by complete flow
  Completed:    [],
}

// Position label → short readable form for display
const POSITION_LABELS: Record<string, string> = {
  FrontCenter:  'Front Center',
  BackCenter:   'Back Center',
  LeftChest:    'Left Chest',
  RightChest:   'Right Chest',
  LeftSleeve:   'Left Sleeve',
  RightSleeve:  'Right Sleeve',
  NeckLabel:    'Neck Label',
}

// Position → body area shorthand for badge
const POSITION_AREA: Record<string, string> = {
  FrontCenter:  'Front',
  BackCenter:   'Back',
  LeftChest:    'L. Chest',
  RightChest:   'R. Chest',
  LeftSleeve:   'L. Sleeve',
  RightSleeve:  'R. Sleeve',
  NeckLabel:    'Neck',
}

// Minimum file sizes considered "likely printable" for raster images (bytes)
const LOW_RES_THRESHOLD_BYTES = 150 * 1024  // 150 KB

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isRasterImage(fileName: string | null): boolean {
  if (!fileName) return false
  const ext = fileName.split('.').pop()?.toLowerCase()
  return ['jpg', 'jpeg', 'png', 'webp'].includes(ext ?? '')
}

function isVectorOrPrint(fileName: string | null): boolean {
  if (!fileName) return false
  const ext = fileName.split('.').pop()?.toLowerCase()
  return ['svg', 'ai', 'pdf'].includes(ext ?? '')
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PrintPositionBadge({ position }: { position: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-black/[0.10] bg-black/[0.03] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/60">
      {POSITION_AREA[position] ?? position.replace(/([A-Z])/g, ' $1').trim()}
    </span>
  )
}

function QualityWarning({ asset }: { asset: OrderItemPositionAsset }) {
  if (!asset.uploadedAssetUrl) return null
  if (isVectorOrPrint(asset.originalFileName)) return null  // vectors are always fine
  if (!isRasterImage(asset.originalFileName)) return null   // unknown type, skip warning
  if (asset.fileSizeBytes !== null && asset.fileSizeBytes >= LOW_RES_THRESHOLD_BYTES) return null

  const reason = asset.fileSizeBytes !== null
    ? `File size is only ${formatFileSize(asset.fileSizeBytes)} — may lack detail for large prints`
    : 'Unable to verify file size'

  return (
    <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
      <p className="text-[11px] text-amber-700" style={{ letterSpacing: '-0.14px' }}>
        <span style={{ fontWeight: 480 }}>Low resolution warning</span>{' '}
        — {reason}
      </p>
    </div>
  )
}

function DesignCard({
  asset,
  onZoom,
  onReplace,
}: {
  asset: OrderItemPositionAsset
  onZoom: () => void
  onReplace?: (assetId: string, assetUrl: string) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const result = await filesApi.upload(file)
      await onReplace?.(result.assetId, result.fileUrl)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-black/[0.08] bg-white">
      {/* Thumbnail / preview */}
      <div className="relative bg-black/[0.025]">
        {asset.uploadedAssetUrl ? (
          <button
            type="button"
            onClick={onZoom}
            className="group relative block w-full"
            title="Click to zoom"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.uploadedAssetUrl}
              alt={`Design: ${POSITION_LABELS[asset.position] ?? asset.position}`}
              className="h-44 w-full object-contain p-3 transition-transform duration-200 group-hover:scale-105"
            />
            {/* Zoom hint overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
              <div className="rounded-full bg-black/60 p-2">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                </svg>
              </div>
            </div>
          </button>
        ) : (
          <div className="flex h-44 items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-black/20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-10 w-10">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-mono text-[10px] uppercase tracking-[0.54px]">No file</span>
            </div>
          </div>
        )}
      </div>

      {/* Info strip */}
      <div className="border-t border-black/[0.06] px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <PrintPositionBadge position={asset.position} />
          {asset.fileSizeBytes !== null && (
            <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/35">
              {formatFileSize(asset.fileSizeBytes)}
            </span>
          )}
        </div>

        {asset.originalFileName && (
          <p className="mt-1 truncate text-[11px] text-black/45" style={{ letterSpacing: '-0.14px' }}
             title={asset.originalFileName}>
            {asset.originalFileName}
          </p>
        )}

        {asset.designNote && (
          <div className="mt-1.5 rounded-md border border-amber-100 bg-amber-50 px-2 py-1.5">
            <p className="text-[10px] font-mono uppercase tracking-[0.54px] text-amber-600 mb-0.5">Design note</p>
            <p className="text-[11px] leading-snug text-amber-700" style={{ letterSpacing: '-0.14px' }}>
              {asset.designNote}
            </p>
          </div>
        )}

        <QualityWarning asset={asset} />

        {asset.uploadedAssetUrl && (
          <div className="mt-2 flex items-center gap-1.5">
            <DownloadDesignButton
              url={asset.uploadedAssetUrl}
              fileName={asset.originalFileName}
              compact
            />
            {onReplace && (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*,.pdf,.ai,.svg"
                  className="hidden"
                  onChange={handleFile}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => inputRef.current?.click()}
                  className={clsx(
                    'inline-flex flex-1 items-center justify-center gap-1 rounded-[50px] border border-dashed font-mono text-[10px] uppercase tracking-[0.54px] transition-colors',
                    uploading
                      ? 'cursor-not-allowed border-black/[0.08] text-black/25'
                      : 'border-black/[0.15] text-black/45 hover:border-black/30 hover:text-black',
                    'py-1',
                  )}
                >
                  {uploading ? (
                    <>
                      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Uploading
                    </>
                  ) : 'Replace'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
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
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <SkeletonBlock className="h-36 rounded-lg" />
          <SkeletonBlock className="h-28 rounded-lg" />
          <SkeletonBlock className="h-48 rounded-lg" />
        </div>
        <SkeletonBlock className="h-[500px] rounded-lg" />
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [savingChecklist, setSavingChecklist] = useState(false)
  const [recordingNotification, setRecordingNotification] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success')
  const [zoomAsset, setZoomAsset] = useState<OrderItemPositionAsset | null>(null)

  useEffect(() => {
    ordersApi.getById(id).then(setOrder).finally(() => setLoading(false))
  }, [id])

  // ── Action handlers ──────────────────────────────────────────────────────

  async function handlePositionDesignUpdate(
    itemId: string,
    position: PrintPosition,
    assetId: string,
    assetUrl: string,
  ) {
    if (!order) return
    try {
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
              positionAssets: i.positionAssets.map((p) =>
                p.position === position
                  ? { ...p, uploadedAssetId: assetId, uploadedAssetUrl: assetUrl }
                  : p,
              ),
            } : i,
          ),
        } : prev,
      )
      showToast('Design replaced')
    } catch {
      showToast('Cannot modify a cancelled order', 'error')
    }
  }

  async function handleStatusChange(newStatus: OrderStatus) {
    if (!order) return
    setUpdating(true)
    try {
      const updated = await ordersApi.updateStatus(order.id, newStatus)
      setOrder(updated)
      showToast(`Status updated to ${STATUS_CONFIG[newStatus]?.label ?? newStatus}`)
    } finally {
      setUpdating(false)
    }
  }

  async function handleChecklistUpdate(payload: Pick<Order,
    'isDesignReviewed' |
    'isPrintPositionConfirmed' |
    'isFileDownloaded' |
    'isGarmentConfirmed' |
    'isReadyToPrint'
  >) {
    if (!order) return
    setSavingChecklist(true)
    try {
      const updated = await ordersApi.updateChecklist(order.id, payload)
      setOrder(updated)
      showToast('Preparation checklist saved')
    } catch {
      showToast('Could not save preparation checklist', 'error')
    } finally {
      setSavingChecklist(false)
    }
  }

  async function handleRecordNotification() {
    if (!order) return
    setRecordingNotification(true)
    try {
      const updated = await ordersApi.recordNotification(order.id)
      setOrder(updated)
      showToast('Customer notification placeholder recorded')
    } catch {
      showToast('Notifications can only be recorded when the order is Ready', 'error')
    } finally {
      setRecordingNotification(false)
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

  async function handleApproveForPrinting() {
    if (!order) return
    setUpdating(true)
    try {
      const updated = await ordersApi.approveForPrinting(order.id)
      setOrder(updated)
      showToast('Design approved for printing')
    } catch {
      showToast('Cannot approve at this stage', 'error')
    } finally {
      setUpdating(false)
    }
  }

  async function handleStartPrinting() {
    if (!order) return
    setUpdating(true)
    try {
      const updated = await ordersApi.startPrinting(order.id)
      setOrder(updated)
      showToast('Printing started')
    } catch {
      showToast('Cannot start printing — design must be approved first', 'error')
    } finally {
      setUpdating(false)
    }
  }

  async function handleMarkReady() {
    if (!order) return
    setUpdating(true)
    try {
      const updated = await ordersApi.markReady(order.id)
      setOrder(updated)
      showToast('Order marked as Ready')
    } catch {
      showToast('Cannot mark ready at this stage', 'error')
    } finally {
      setUpdating(false)
    }
  }

  async function handleComplete() {
    if (!order) return
    setUpdating(true)
    try {
      const updated = await ordersApi.complete(order.id)
      setOrder(updated)
      showToast('Order completed')
    } catch {
      showToast('Cannot complete at this stage', 'error')
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

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return <DetailSkeleton />

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-4xl text-black/15" style={{ fontWeight: 320, letterSpacing: '-1.72px' }}>404</p>
        <p className="mt-1 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>Order not found.</p>
        <Link href="/admin/orders"
              className="mt-4 text-sm text-black/50 underline underline-offset-2 transition-colors hover:text-black"
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
  const isCompleted = order.status === 'Completed'
  const isTerminal = isCompleted || isCancelled
  const pipelineIdx = PIPELINE.indexOf(order.status)

  const allPositionAssets = order.items.flatMap((i) => i.positionAssets)
  const hasAnyDesign = allPositionAssets.some((p) => p.uploadedAssetUrl)
  const lowResCount = allPositionAssets.filter(
    (p) => p.uploadedAssetUrl &&
           isRasterImage(p.originalFileName) &&
           !isVectorOrPrint(p.originalFileName) &&
           p.fileSizeBytes !== null &&
           p.fileSizeBytes < LOW_RES_THRESHOLD_BYTES,
  ).length

  return (
    <div className="admin-page admin-stack">
      {/* Toast */}
      {toast && (
        <div className={clsx(
          'fixed bottom-6 right-6 z-50 rounded-[50px] px-5 py-2.5 text-sm text-white shadow-elevated',
          toastTone === 'success' ? 'bg-black' : 'bg-red-600',
        )}>
          {toast}
        </div>
      )}

      {/* Image zoom modal */}
      {zoomAsset?.uploadedAssetUrl && (
        <ImageZoomModal
          url={zoomAsset.uploadedAssetUrl}
          fileName={zoomAsset.originalFileName}
          position={zoomAsset.position}
          onClose={() => setZoomAsset(null)}
        />
      )}

      {/* Page header */}
      <div className="flex flex-wrap items-start gap-3">
        <Link href="/admin/orders"
          className="mt-0.5 flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50 transition-colors hover:text-black">
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
            {/* Low-res alert in header */}
            {lowResCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-amber-700">
                <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                {lowResCount} low-res
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
            Placed {new Date(order.creationTime).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
      </div>

      {/* Activation panel — shown only while in early stages */}
      {!isCancelled && !isCompleted && (
        <OrderActionPanel
          status={order.status}
          isApprovedForPrinting={order.isApprovedForPrinting}
          loading={updating}
          onMarkPaid={handleMarkPaid}
          onStartReview={handleStartReview}
          onApproveForPrinting={handleApproveForPrinting}
          onStartPrinting={handleStartPrinting}
        />
      )}

      {/* Pipeline progress */}
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
                      {done ? '✓' : i + 1}
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

          {/* Fulfillment actions — shown for Printing and Ready states */}
          {order.status === 'Printing' && (
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-black/[0.08] pt-4">
              <Button size="sm" loading={updating} onClick={handleMarkReady}>
                Mark as Ready
              </Button>
              <Button size="sm" variant="glass" loading={updating} onClick={() => handleStatusChange('Cancelled')}>
                Cancel Order
              </Button>
            </div>
          )}
          {order.status === 'Ready' && (
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-black/[0.08] pt-4">
              <Button size="sm" loading={updating} onClick={handleComplete}>
                Complete Order
              </Button>
            </div>
          )}

          {!isTerminal && advanceNext.length > 0 && (
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

      {/* ── Main two-column layout ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">

        {/* ── LEFT: meta + notes ── */}
        <div className="space-y-4">

          {/* Customer */}
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

          {/* Shipping */}
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

          {/* Customer notes */}
          {order.notes && (
            <Card>
              <CardHeader>
                <h2 className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">Customer Note</h2>
              </CardHeader>
              <CardBody>
                <p className="text-sm leading-relaxed text-black/60" style={{ letterSpacing: '-0.14px' }}>
                  {order.notes}
                </p>
              </CardBody>
            </Card>
          )}

          {/* Admin notes */}
          <NotesPanel
            orderId={order.id}
            initialNotes={order.adminNotes}
            onSaved={(notes) => setOrder((prev) => prev ? { ...prev, adminNotes: notes } : prev)}
          />

          <FileInfoCard items={order.items} />

          <PreparationChecklist
            order={order}
            saving={savingChecklist}
            onChange={handleChecklistUpdate}
          />

          <NotificationPanel
            canRecord={order.status === 'Ready'}
            loading={recordingNotification}
            onRecord={handleRecordNotification}
          />

          {/* Activity timeline */}
          {order.timeline.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">Activity</h2>
              </CardHeader>
              <CardBody>
                <OrderTimeline entries={order.timeline} />
              </CardBody>
            </Card>
          )}

          {/* Fulfillment info — always visible once order is past Reviewing */}
          {!['Pending', 'Paid', 'Reviewing'].includes(order.status) && !isCancelled && (
            <FulfillmentPanel
              deliveryMethod={order.deliveryMethod}
              shippingAddress={order.shippingAddress}
              customerNote={order.notes}
            />
          )}

          {/* Completion confirmation */}
          {isCompleted && (
            <CompletionBanner orderNumber={order.orderNumber} />
          )}

          {/* Cancelled state */}
          {isCancelled && (
            <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p style={{ fontWeight: 480 }}>Order Cancelled</p>
              <p className="mt-0.5 text-xs text-red-500">
                Can be reopened within 24 hours. Design edits are locked.
              </p>
              <div className="mt-3">
                <Button size="sm" variant="white" loading={updating} onClick={handleReopen}>
                  Re-open Order
                </Button>
              </div>
            </div>
          )}

        </div>

        {/* ── RIGHT: design review workstation ── */}
        <div className="space-y-6">

          {/* Order totals summary */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                Order Items
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
                {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                {' · '}
                <span className="text-black" style={{ fontWeight: 540 }}>${order.totalAmount.toFixed(2)}</span>
              </span>
            </CardHeader>
            <CardBody className="p-0">
              <div className="divide-y divide-black/[0.06]">
                {order.items.map((item) => (
                  <div key={item.id}>
                    {/* Item header row */}
                    <div className="flex items-start gap-4 px-5 pt-4 pb-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                          {item.productName}
                        </p>
                        <p className="mt-0.5 text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>
                          {item.variantLabel}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <span className="inline-flex items-center rounded-full border border-black/[0.08] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
                            Qty {item.quantity}
                          </span>
                          {item.positionAssets.map((p) => (
                            <PrintPositionBadge key={p.id} position={p.position} />
                          ))}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm text-black" style={{ fontWeight: 540 }}>
                          ${(item.unitPrice * item.quantity).toFixed(2)}
                        </p>
                        <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                          ${item.unitPrice.toFixed(2)} each
                        </p>
                      </div>
                    </div>

                    {/* Design cards grid */}
                    {item.positionAssets.length > 0 && (
                      <div className="px-5 pb-4">
                        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">
                          Design Files — {item.positionAssets.length} position{item.positionAssets.length !== 1 ? 's' : ''}
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {item.positionAssets.map((asset) => (
                            <DesignCard
                              key={asset.id}
                              asset={asset}
                              onZoom={() => setZoomAsset(asset)}
                              onReplace={isCancelled ? undefined : async (assetId, assetUrl) =>
                                handlePositionDesignUpdate(item.id, asset.position as PrintPosition, assetId, assetUrl)
                              }
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {item.positionAssets.length === 0 && (
                      <div className="px-5 pb-4">
                        <div className="rounded-lg border border-dashed border-black/[0.10] bg-black/[0.02] px-4 py-4 text-center font-mono text-[11px] uppercase tracking-[0.54px] text-black/35">
                          No design files attached to this item.
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Print readiness summary */}
          {hasAnyDesign && (
            <div className={clsx(
              'rounded-lg border p-4',
              lowResCount > 0
                ? 'border-amber-200 bg-amber-50'
                : 'border-black/[0.08] bg-black/[0.02]',
            )}>
              <div className="flex items-center gap-2">
                {lowResCount > 0 ? (
                  <svg className="h-4 w-4 flex-shrink-0 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4 flex-shrink-0 text-black/40" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                )}
                <p className={clsx(
                  'text-sm',
                  lowResCount > 0 ? 'text-amber-800' : 'text-black/60',
                )} style={{ letterSpacing: '-0.14px' }}>
                  {lowResCount > 0
                    ? `${lowResCount} design file${lowResCount !== 1 ? 's' : ''} may be too low resolution for print. Review before proceeding.`
                    : 'All design files appear suitable for print.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
