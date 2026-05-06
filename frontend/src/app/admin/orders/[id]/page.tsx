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
import { NotesPanel } from '@/components/admin/NotesPanel'
import { OrderTimeline } from '@/components/admin/OrderTimeline'
import { FulfillmentPanel } from '@/components/admin/FulfillmentPanel'
import { CompletionBanner } from '@/components/admin/CompletionBanner'
import { PreparationChecklist } from '@/components/admin/PreparationChecklist'
import { NotificationPanel } from '@/components/admin/NotificationPanel'
import { DownloadDesignButton } from '@/components/orders/DownloadDesignButton'
import type { Order, OrderItem, OrderItemPrint, OrderStatus } from '@/types'
import clsx from 'clsx'

// 鈹€鈹€ Constants 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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


// 鈹€鈹€ Helpers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function getFileNameFromUrl(url: string | null | undefined) {
  if (!url) return null
  try {
    return decodeURIComponent(url.split('/').pop() ?? 'design')
  } catch {
    return url.split('/').pop() ?? 'design'
  }
}

// 鈹€鈹€ Sub-components 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function getPrintSummary(item: OrderItem) {
  return item.prints ?? []
}

function getPrintAreaPrice(itemPrint: NonNullable<OrderItem['prints']>[number]) {
  return itemPrint.printAreaPrice ?? 0
}

function getPrintSizePrice(itemPrint: NonNullable<OrderItem['prints']>[number]) {
  return itemPrint.printSizePrice ?? 0
}

function getPrintEntryTotal(itemPrint: NonNullable<OrderItem['prints']>[number]) {
  return getPrintAreaPrice(itemPrint) + getPrintSizePrice(itemPrint)
}

function getTotalPrintAddOns(item: OrderItem) {
  return getPrintSummary(item).reduce((sum, itemPrint) => sum + getPrintEntryTotal(itemPrint), 0)
}

function getLineTotal(item: OrderItem) {
  return item.lineTotal ?? item.unitPrice * item.quantity
}

function getInferredProductAndVariantPortion(item: OrderItem) {
  return item.unitPrice - getTotalPrintAddOns(item)
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`
}

function PrintDesignCard({
  print,
  disabled,
  onReplace,
  onClear,
}: {
  print: OrderItemPrint
  disabled: boolean
  onReplace: (print: OrderItemPrint, assetId: string, assetUrl: string) => Promise<void>
  onClear: (print: OrderItemPrint) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileName = getFileNameFromUrl(print.uploadedAssetUrl)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const result = await filesApi.upload(file)
      await onReplace(print, result.assetId, result.fileUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not replace this design.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-black/[0.08] bg-white">
      <div className="flex gap-3 p-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/[0.08] bg-black/[0.02]">
          {print.uploadedAssetUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={print.uploadedAssetUrl}
              alt={`Design for ${print.printAreaName}`}
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8 text-black/20">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-black/[0.08] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
              {print.printAreaName}
            </span>
            <span className="rounded-full border border-black/[0.08] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
              {print.printSizeName}
            </span>
          </div>
          <p className="mt-2 text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>
            {print.uploadedAssetUrl ? 'Design uploaded' : 'No design uploaded'}
          </p>
          {fileName && (
            <p className="mt-0.5 truncate text-[11px] text-black/40" title={fileName}>
              {fileName}
            </p>
          )}
          {print.designNote && (
            <div className="mt-2 rounded-md border border-amber-100 bg-amber-50 px-2 py-1.5">
              <p className="text-[10px] font-mono uppercase tracking-[0.54px] text-amber-600 mb-0.5">Design note</p>
              <p className="text-[11px] leading-snug text-amber-700" style={{ letterSpacing: '-0.14px' }}>
                {print.designNote}
              </p>
            </div>
          )}
          {error && (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
              {error}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {print.uploadedAssetUrl && (
              <DownloadDesignButton url={print.uploadedAssetUrl} fileName={fileName} compact />
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.pdf,.ai,.svg"
              className="hidden"
              onChange={handleFile}
            />
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex flex-1 items-center justify-center rounded-[50px] border border-dashed border-black/[0.15] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45 transition-colors hover:border-black/30 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {uploading ? 'Uploading' : print.uploadedAssetUrl ? 'Replace' : 'Upload'}
            </button>
            {print.uploadedAssetUrl && (
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => onClear(print)}
                className="inline-flex items-center justify-center rounded-[50px] border border-black/[0.10] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/40 transition-colors hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear
              </button>
            )}
          </div>
        </div>
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

// 鈹€鈹€ Page 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [savingChecklist, setSavingChecklist] = useState(false)
  const [recordingNotification, setRecordingNotification] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success')

  useEffect(() => {
    ordersApi.getById(id).then(setOrder).finally(() => setLoading(false))
  }, [id])

  // 鈹€鈹€ Action handlers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  async function handlePrintDesignReplace(print: OrderItemPrint, assetId: string, assetUrl: string) {
    if (!order) return
    try {
      const updated = await ordersApi.updatePrintDesign(order.id, print.id, {
        uploadedAssetId: assetId,
        uploadedAssetUrl: assetUrl,
        designNote: print.designNote,
      })
      setOrder(updated)
      showToast('Print design replaced')
    } catch {
      showToast('Could not replace print design', 'error')
      throw new Error('Could not replace print design')
    }
  }

  async function handlePrintDesignClear(print: OrderItemPrint) {
    if (!order) return
    try {
      const updated = await ordersApi.updatePrintDesign(order.id, print.id, {
        uploadedAssetId: null,
        uploadedAssetUrl: null,
        designNote: print.designNote ?? null,
      })
      setOrder(updated)
      showToast('Print design cleared')
    } catch {
      showToast('Could not clear print design', 'error')
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

  // 鈹€鈹€ Render 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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
          </div>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
            Placed {new Date(order.creationTime).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
      </div>

      {/* Activation panel 鈥?shown only while in early stages */}
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

          {/* Fulfillment actions 鈥?shown for Printing and Ready states */}
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

      {/* 鈹€鈹€ Main two-column layout 鈹€鈹€ */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">

        {/* 鈹€鈹€ LEFT: meta + notes 鈹€鈹€ */}
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
            disabled={isCancelled}
            onSaved={(notes) => setOrder((prev) => prev ? { ...prev, adminNotes: notes } : prev)}
          />


          <PreparationChecklist
            order={order}
            saving={savingChecklist}
            disabled={isCancelled}
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

          {/* Fulfillment info 鈥?always visible once order is past Reviewing */}
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

        {/* 鈹€鈹€ RIGHT: design review workstation 鈹€鈹€ */}
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
                          {getPrintSummary(item).map((print) => (
                            <span key={`${print.printAreaId}:${print.printSizeId}`}
                              className="inline-flex items-center rounded-full border border-black/[0.08] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
                              {print.printAreaName} · {print.printSizeName}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Print-area design cards */}
                    {getPrintSummary(item).length > 0 && (
                      <div className="px-5 pb-4">
                        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">
                          Print Design Files
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {getPrintSummary(item)
                            .slice()
                            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                            .map((print) => (
                              <PrintDesignCard
                                key={print.id}
                                print={print}
                                disabled={isCancelled}
                                onReplace={handlePrintDesignReplace}
                                onClear={handlePrintDesignClear}
                              />
                            ))}
                        </div>
                      </div>
                    )}

                    {getPrintSummary(item).length === 0 && (
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

        </div>
      </div>
    </div>
  )
}


