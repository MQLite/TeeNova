'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { makeOrdersApi } from '@/api/orders'
import { makeFilesApi } from '@/api/files'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'

const ordersApi = makeOrdersApi(adminApiClient)
const filesApi = makeFilesApi(adminApiClient)
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { OrderActionPanel } from '@/components/admin/OrderActionPanel'
import { OrderStatusBadge, STATUS_CONFIG } from '@/components/admin/OrderStatusBadge'
import { SkeletonBlock } from '@/components/admin/LoadingSkeleton'
import { NotesPanel } from '@/components/admin/NotesPanel'
import { OrderTimeline } from '@/components/admin/OrderTimeline'
import { FulfillmentPanel } from '@/components/admin/FulfillmentPanel'
import { CompletionBanner } from '@/components/admin/CompletionBanner'
import { NotificationPanel } from '@/components/admin/NotificationPanel'
import { PaymentSection } from '@/components/admin/PaymentSection'
import { RecordPaymentModal } from '@/components/admin/RecordPaymentModal'
import { AdjustOrderPriceModal } from '@/components/admin/AdjustOrderPriceModal'
import { OrderContentEditModal } from '@/components/admin/OrderContentEditModal'
import { DownloadDesignButton } from '@/components/orders/DownloadDesignButton'
import { DownloadProductionPdfButton } from '@/components/admin/DownloadProductionPdfButton'
import type { AdjustOrderPriceInput, Order, OrderItem, OrderPrintGroup, OrderPrintGroupRow, OrderStatus, RecordPaymentInput } from '@/types'
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

function getLineTotal(item: OrderItem) {
  return item.lineTotal ?? item.unitPrice * item.quantity
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`
}

// ── Grouped print summary helpers (Jira 9404) ───────────────────────────────────

/** Color/size are display-only row details (never part of the group key). Fall back to the raw label. */
function formatGroupRowVariant(row: OrderPrintGroupRow) {
  const color = row.color?.trim()
  const size = row.garmentSize?.trim()
  if (color && size) return `${color} / ${size}`
  if (color) return color
  if (size) return size
  return row.variantLabel?.trim() || '—'
}

function groupReactKey(group: OrderPrintGroup) {
  return group.groupKey || `${group.designKey}|${group.printAreaId}|${group.printSizeId}`
}

function itemHasNoPrints(item: OrderItem) {
  return !item.prints || item.prints.length === 0
}

/**
 * Design controls for one print group (thumbnail + Download / Replace / Clear). A group shares one
 * design across all its member prints, so Replace/Clear here apply the change to EVERY print in the
 * group via the parent handler. Used inside the Grouped Print Summary header.
 */
function GroupDesignControls({
  designUrl,
  designName,
  disabled,
  onReplace,
  onClear,
}: {
  designUrl: string | null
  designName: string
  disabled: boolean
  onReplace: (assetId: string, assetUrl: string) => Promise<void>
  onClear: () => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileName = getFileNameFromUrl(designUrl)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const result = await filesApi.upload(file)
      await onReplace(result.assetId, result.fileUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not replace this design.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleClear() {
    setBusy(true)
    setError(null)
    try {
      await onClear()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear this design.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex shrink-0 gap-2.5">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/[0.08] bg-white">
        {designUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={designUrl}
            alt={`Design ${designName}`}
            className="h-full w-full object-contain p-1"
          />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7 text-black/20">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )}
      </div>
      <div className="flex w-24 flex-col gap-1">
        {designUrl && <DownloadDesignButton url={designUrl} fileName={fileName} compact />}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf,.ai,.svg"
          className="hidden"
          onChange={handleFile}
        />
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center justify-center rounded-[50px] border border-dashed border-black/[0.15] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45 transition-colors hover:border-black/30 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Working' : designUrl ? 'Replace' : 'Upload'}
        </button>
        {designUrl && (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={handleClear}
            className="inline-flex items-center justify-center rounded-[50px] border border-black/[0.10] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/40 transition-colors hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear
          </button>
        )}
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-1.5 py-1 text-[10px] leading-snug text-red-700">
            {error}
          </p>
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

// 鈹€鈹€ Page 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [recordingNotification, setRecordingNotification] = useState(false)
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false)
  const [adjustPriceOpen, setAdjustPriceOpen] = useState(false)
  const [editContentOpen, setEditContentOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success')

  useEffect(() => {
    ordersApi.getById(id)
      .then(setOrder)
      .catch((err) => { if (err instanceof ApiError && err.status === 401) redirectToLogin('session-expired') })
      .finally(() => setLoading(false))
  }, [id])

  // 鈹€鈹€ Action handlers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  // A print group shares one design across all member prints. Replacing/clearing applies the change
  // to every print in the group via the existing per-print design endpoint (IDs are stable across
  // these calls — updatePrintDesign does not regenerate them), then rehydrates from the final order.
  async function handleGroupDesignReplace(group: OrderPrintGroup, assetId: string, assetUrl: string) {
    if (!order) return
    try {
      let updated = order
      for (const row of group.rows) {
        updated = await ordersApi.updatePrintDesign(order.id, row.orderItemPrintId, {
          uploadedAssetId: assetId,
          uploadedAssetUrl: assetUrl,
          designNote: row.designNote ?? null,
        })
      }
      setOrder(updated)
      showToast('Print design replaced')
    } catch {
      showToast('Could not replace print design', 'error')
      throw new Error('Could not replace print design')
    }
  }

  async function handleGroupDesignClear(group: OrderPrintGroup) {
    if (!order) return
    try {
      let updated = order
      for (const row of group.rows) {
        updated = await ordersApi.updatePrintDesign(order.id, row.orderItemPrintId, {
          uploadedAssetId: null,
          uploadedAssetUrl: null,
          designNote: row.designNote ?? null,
        })
      }
      setOrder(updated)
      showToast('Print design cleared')
    } catch {
      showToast('Could not clear print design', 'error')
      throw new Error('Could not clear print design')
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
      showToast('Order activated')
    } catch (err) {
      const msg = err instanceof Error ? err.message : null
      showToast(msg ?? 'Payment threshold not met. Record sufficient payment first.', 'error')
    } finally {
      setUpdating(false)
    }
  }

  async function handleRecordPayment(input: RecordPaymentInput) {
    if (!order) return
    try {
      const updated = await ordersApi.recordPayment(order.id, input)
      setOrder(updated)
      setRecordPaymentOpen(false)
      showToast('Payment recorded')
    } catch {
      showToast('Failed to record payment', 'error')
    }
  }

  function friendlyAdjustError(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 401) {
        redirectToLogin('session-expired')
        return 'Your session has expired. Please sign in again.'
      }
      const raw = (err.message ?? '').toLowerCase()
      if (raw.includes('terminal') || raw.includes('cancelled') || raw.includes('completed')) {
        return 'This order cannot be adjusted because it is completed or cancelled.'
      }
      if (raw.includes('belowpaid') || raw.includes('below the amount') || raw.includes('paid amount')) {
        return 'New total cannot be less than the amount already paid.'
      }
      if (raw.includes('positive') || raw.includes('greater than zero')) {
        return 'New total must be greater than zero.'
      }
      if (raw.includes('reason')) {
        return 'Please enter a reason for this adjustment.'
      }
    }
    return 'Unable to adjust price. Please try again.'
  }

  async function handleAdjustPrice(input: AdjustOrderPriceInput) {
    if (!order) return
    try {
      const updated = await ordersApi.adjustPrice(order.id, input)
      setOrder(updated)
      setAdjustPriceOpen(false)
      showToast('Order price adjusted')
    } catch (err) {
      // Re-throw a friendly message so the modal can display it inline.
      throw new Error(friendlyAdjustError(err))
    }
  }

  function handleContentSaved(updated: Order) {
    // Backend regenerates item/print IDs and returns fresh PrintGroups/totals — replace wholesale.
    setOrder(updated)
    setEditContentOpen(false)
    showToast('Order content updated')
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

  async function handleStartPrinting() {
    if (!order) return
    setUpdating(true)
    try {
      if (!order.isApprovedForPrinting) {
        await ordersApi.approveForPrinting(order.id)
      }
      const updated = await ordersApi.startPrinting(order.id)
      setOrder(updated)
      showToast('Printing started')
    } catch {
      showToast('Cannot start printing', 'error')
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

  async function handleDelete() {
    if (!order) return
    const confirmed = window.confirm(
      `Permanently delete order ${order.orderNumber}? This removes the order and all of its ` +
      `timeline, payment and price-adjustment history. This cannot be undone.`,
    )
    if (!confirmed) return
    setDeleting(true)
    try {
      await ordersApi.delete(order.id)
      router.push('/admin/orders')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin('session-expired')
        return
      }
      showToast('Could not delete this order', 'error')
      setDeleting(false)
    }
  }

  function showToast(msg: string, tone: 'success' | 'error' = 'success') {
    setToastTone(tone)
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function isPaymentRequirementMet(o: Order): boolean {
    if (o.paymentRequirementType === 'DepositThenBalance') {
      return o.requiredDepositAmount != null && o.paidAmount >= o.requiredDepositAmount
    }
    return o.paidAmount >= o.requiredPaymentAmount
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

  // Grouped print summary (Jira 9404) — driven entirely by the backend read model. Optional so an
  // older backend that omits `printGroups` simply renders no grouped section (page never crashes).
  const printGroups = order.printGroups ?? []
  // Garment-only items come from the unchanged flat `items`, so they are never lost from the view
  // when the grouped summary only contains item×print fan-out rows.
  const garmentOnlyItems = order.items.filter(itemHasNoPrints)

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
        {/* Always available (incl. Cancelled/Completed) for archive/workshop use. */}
        <DownloadProductionPdfButton
          orderId={order.id}
          orderNumber={order.orderNumber}
          onError={(msg) => showToast(msg, 'error')}
        />
        <Button
          variant="ghost"
          onClick={handleDelete}
          disabled={deleting}
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
      </div>

      {/* Activation panel 鈥?shown only while in early stages */}
      {!isCancelled && !isCompleted && (
        <OrderActionPanel
          status={order.status}
          loading={updating}
          onMarkPaid={handleMarkPaid}
          onStartReview={handleStartReview}
          onStartPrinting={handleStartPrinting}
          paymentThresholdMet={isPaymentRequirementMet(order)}
          paymentRequirementType={order.paymentRequirementType}
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

          {/* Payment */}
          <PaymentSection
            order={order}
            onRecordPayment={() => setRecordPaymentOpen(true)}
            onAdjustPrice={() => setAdjustPriceOpen(true)}
          />

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

          {/* Content edit toolbar (Jira 9406) — server-priced order-content edit */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/[0.08] bg-white px-5 py-3">
            <div>
              <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                Order Content
              </p>
              <p className="mt-0.5 text-[11px] text-black/45" style={{ letterSpacing: '-0.14px' }}>
                {isTerminal
                  ? `Editing is disabled while the order is ${isCancelled ? 'cancelled' : 'completed'}.`
                  : 'Edit items, variants, prints and notes. The server reprices and rehydrates the order.'}
              </p>
            </div>
            <Button
              size="sm"
              variant="white"
              disabled={isTerminal}
              onClick={() => setEditContentOpen(true)}
            >
              Edit order content
            </Button>
          </div>

          {/* Grouped print summary (Jira 9404) — design + print position + print size */}
          {printGroups.length > 0 && (
            <Card>
              <CardHeader className="flex items-center justify-between">
                <h2 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                  Grouped Print Summary
                </h2>
                <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
                  {printGroups.length} group{printGroups.length !== 1 ? 's' : ''}
                </span>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-[11px] leading-snug text-black/40" style={{ letterSpacing: '-0.14px' }}>
                  Grouped by design · print position · print size. Colour and garment size are row
                  details only. This is a production summary — order totals remain based on the original
                  item snapshots.
                </p>

                {printGroups.map((group) => {
                  // One design per group: pick the first member print that carries an uploaded asset.
                  const groupDesignUrl = group.rows.find((r) => r.uploadedAssetUrl)?.uploadedAssetUrl ?? null
                  return (
                  <div key={groupReactKey(group)} className="overflow-hidden rounded-lg border border-black/[0.08]">
                    {/* Group header: design file controls + position + size + total quantity */}
                    <div className="flex flex-wrap items-start gap-3 border-b border-black/[0.06] bg-black/[0.02] px-4 py-3">
                      <GroupDesignControls
                        designUrl={groupDesignUrl}
                        designName={group.designName || 'design'}
                        disabled={isCancelled}
                        onReplace={(assetId, assetUrl) => handleGroupDesignReplace(group, assetId, assetUrl)}
                        onClear={() => handleGroupDesignClear(group)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}
                          title={group.designName || 'No design uploaded'}>
                          {group.designName || 'No design uploaded'}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <span className="inline-flex items-center rounded-full border border-black/[0.08] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
                            {group.printAreaName || 'Unknown print position'}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-black/[0.08] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                            {group.printSizeName || 'Unknown print size'}
                          </span>
                        </div>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-black px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-white">
                        Qty {group.totalQuantity}
                      </span>
                    </div>

                    {/* Group rows: product / colour / garment size / qty / unit price / line total */}
                    <div className="divide-y divide-black/[0.06]">
                      {group.rows.map((row) => (
                        <div key={row.orderItemPrintId} className="flex flex-wrap items-start gap-3 px-4 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                              {row.productName || 'Product'}
                            </p>
                            <p className="mt-0.5 text-[11px] text-black/55" style={{ letterSpacing: '-0.14px' }}>
                              {formatGroupRowVariant(row)}
                            </p>
                            {(row.designNote || row.printNotes) && (
                              <div className="mt-1.5 space-y-0.5">
                                {row.designNote && (
                                  <p className="text-[10px] leading-snug text-black/45" style={{ letterSpacing: '-0.14px' }}>
                                    Design note: {row.designNote}
                                  </p>
                                )}
                                {row.printNotes && (
                                  <p className="text-[10px] leading-snug text-black/45" style={{ letterSpacing: '-0.14px' }}>
                                    Print note: {row.printNotes}
                                  </p>
                                )}
                              </div>
                            )}
                            {row.isLegacyPricingSnapshot && (
                              <span className="mt-1.5 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.54px] text-amber-600">
                                Legacy pricing
                              </span>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                              Qty {row.quantity}
                            </p>
                            <p className="mt-0.5 text-xs text-black" style={{ fontWeight: 480 }}>
                              {formatMoney(row.lineTotal)}
                            </p>
                            <p className="text-[10px] text-black/40">{formatMoney(row.unitPrice)} ea</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  )
                })}
              </CardBody>
            </Card>
          )}

          {/* Garment-only items (no prints) — sourced from the unchanged flat items */}
          {garmentOnlyItems.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
                  Garment-only Items
                </h2>
              </CardHeader>
              <CardBody className="p-0">
                <div className="divide-y divide-black/[0.06]">
                  {garmentOnlyItems.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                          {item.productName || 'Product'}
                        </p>
                        <p className="mt-0.5 text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>
                          {item.variantLabel || '—'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                          Qty {item.quantity}
                        </p>
                        <p className="mt-0.5 text-xs text-black" style={{ fontWeight: 480 }}>
                          {formatMoney(getLineTotal(item))}
                        </p>
                        <p className="text-[10px] text-black/40">{formatMoney(item.unitPrice)} ea</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

        </div>
      </div>

      {/* Record Payment modal */}
      <RecordPaymentModal
        order={order}
        open={recordPaymentOpen}
        onClose={() => setRecordPaymentOpen(false)}
        onSubmit={handleRecordPayment}
      />

      {/* Adjust Price modal */}
      <AdjustOrderPriceModal
        order={order}
        open={adjustPriceOpen}
        onClose={() => setAdjustPriceOpen(false)}
        onSubmit={handleAdjustPrice}
      />

      {/* Edit order content modal (Jira 9406) */}
      <OrderContentEditModal
        order={order}
        open={editContentOpen}
        onClose={() => setEditContentOpen(false)}
        onSaved={handleContentSaved}
      />
    </div>
  )
}
