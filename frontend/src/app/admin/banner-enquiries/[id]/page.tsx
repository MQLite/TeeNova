'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { adminBannerEnquiriesApi } from '@/api/banner-enquiries'
import { redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import { friendlyBannerError } from '@/lib/banner-errors'
import type {
  BannerMaterial,
  BannerQuoteRequest,
  BannerQuoteRequestStatus,
  ConvertBannerQuoteRequestResult,
} from '@/types'

const MATERIAL_LABEL: Record<BannerMaterial, string> = {
  PullUp: 'Pull-up', Pvc: 'PVC', Mesh: 'Mesh', Fabric: 'Fabric', Other: 'Other',
}

const STATUS_STYLE: Record<BannerQuoteRequestStatus, string> = {
  New: 'border-amber-200 bg-amber-50 text-amber-800',
  Reviewed: 'border-blue-200 bg-blue-50 text-blue-800',
  ConvertedToOrder: 'border-green-200 bg-green-50 text-green-800',
  Cancelled: 'border-black/[0.12] bg-black/[0.03] text-black/55',
}

function sizeSummary(r: BannerQuoteRequest): string {
  if (r.sizeMode === 'Custom' && r.width && r.height) {
    const unit = r.unit ? r.unit.toLowerCase() : ''
    const area = r.areaSquareMetres != null ? ` (${r.areaSquareMetres} m²)` : ''
    return `${r.width}×${r.height} ${unit}${area}`.trim()
  }
  return r.sizeLabel || '—'
}

function finishingSummary(r: BannerQuoteRequest): string {
  const parts: string[] = []
  if (r.finishingEyelets) parts.push('Eyelets')
  if (r.finishingHemming) parts.push('Hemming')
  if (r.finishingPolePocket) parts.push('Pole pocket')
  if (r.standIncluded) parts.push('Stand included')
  if (r.standReplacementOnly) parts.push('Stand replacement only')
  if (r.finishingOther) parts.push(r.finishingOther)
  return parts.length > 0 ? parts.join(', ') : '—'
}

export default function AdminBannerEnquiryDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [req, setReq] = useState<BannerQuoteRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Conversion form
  const [quotedTotal, setQuotedTotal] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const [converted, setConverted] = useState<ConvertBannerQuoteRequestResult | null>(null)

  const handleAuth = useCallback((err: unknown): boolean => {
    if (err instanceof ApiError && err.status === 401) {
      redirectToLogin('session-expired')
      return true
    }
    return false
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setReq(await adminBannerEnquiriesApi.get(id))
    } catch (err) {
      if (handleAuth(err)) return
      setError(err instanceof Error ? err.message : 'Could not load this quote request.')
    } finally {
      setLoading(false)
    }
  }, [id, handleAuth])

  useEffect(() => { void load() }, [load])

  async function markReviewed() {
    setBusy(true); setActionError(null)
    try { setReq(await adminBannerEnquiriesApi.markReviewed(id)) }
    catch (err) { if (!handleAuth(err)) setActionError(friendlyBannerError(err)) }
    finally { setBusy(false) }
  }

  async function cancel() {
    setBusy(true); setActionError(null)
    try { setReq(await adminBannerEnquiriesApi.cancel(id)) }
    catch (err) { if (!handleAuth(err)) setActionError(friendlyBannerError(err)) }
    finally { setBusy(false) }
  }

  async function convert() {
    setActionError(null)
    const total = parseFloat(quotedTotal)
    if (isNaN(total) || total <= 0) {
      setActionError('Enter a quote total greater than 0.')
      return
    }
    setBusy(true)
    try {
      const result = await adminBannerEnquiriesApi.convertToOrder(id, {
        quotedTotal: total,
        adminNote: adminNote.trim() || null,
        customerNote: customerNote.trim() || null,
      })
      setConverted(result)
      await load()
    } catch (err) {
      if (!handleAuth(err)) setActionError(friendlyBannerError(err, 'Could not convert this quote request.'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="admin-page"><p className="text-sm text-black/55">Loading…</p></div>
  if (error || !req) {
    return (
      <div className="admin-page admin-stack">
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? 'Quote request not found.'}
        </p>
        <Link href="/admin/banner-enquiries" className="btn-glass btn-sm w-fit">Back to list</Link>
      </div>
    )
  }

  const isConverted = req.status === 'ConvertedToOrder'
  const isCancelled = req.status === 'Cancelled'
  const canConvert = req.status === 'New' || req.status === 'Reviewed'

  return (
    <div className="admin-page admin-stack">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.72px' }}>
              {req.productNameSnapshot}
            </h1>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.4px] ${STATUS_STYLE[req.status]}`}>
              {req.status}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
            {new Date(req.creationTime).toLocaleString()} · Ref {req.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/banner-enquiries" className="btn-glass btn-sm">Back to list</Link>
          {req.status === 'New' && (
            <button type="button" onClick={markReviewed} disabled={busy} className="btn-glass btn-sm disabled:opacity-40">
              Mark reviewed
            </button>
          )}
          {!isConverted && !isCancelled && (
            <button type="button" onClick={cancel} disabled={busy} className="btn-glass btn-sm disabled:opacity-40">
              Cancel request
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p>
      )}

      {req.convertedOrderId && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Converted to order{converted?.orderNumber ? ` ${converted.orderNumber}` : ''}.{' '}
          <Link href={`/admin/orders/${req.convertedOrderId}`} className="underline">View order</Link>
        </div>
      )}

      {/* Details */}
      <div className="card p-6">
        <p className="mb-4 text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>Request details</p>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Customer" value={req.customerName} />
          <Detail label="Email" value={req.customerEmail} />
          <Detail label="Phone" value={req.customerPhone || '—'} />
          <Detail label="Quantity" value={String(req.quantity)} />
          <Detail label="Size mode" value={req.sizeMode} />
          <Detail label="Size" value={sizeSummary(req)} />
          <Detail label="Material" value={req.material === 'Other' ? req.materialDisplayName || 'Other' : MATERIAL_LABEL[req.material]} />
          <Detail label="Finishing" value={finishingSummary(req)} />
          <Detail label="Design note" value={req.designNote || '—'} />
          <Detail label="Banner notes" value={req.bannerNotes || '—'} />
          <Detail label="Customer message" value={req.message || '—'} />
        </div>

        {(req.uploadedAssetUrl || req.uploadedAssetId) && (
          <div className="mt-5 flex items-center gap-4 rounded-2xl border border-black/[0.08] bg-black/[0.02] p-4">
            {req.uploadedAssetUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={req.uploadedAssetUrl} alt="Customer design" className="h-16 w-16 rounded-lg border border-black/[0.08] bg-white object-contain p-1" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-black" style={{ letterSpacing: '-0.14px' }}>Design uploaded</p>
            </div>
            {req.uploadedAssetUrl && (
              <a href={req.uploadedAssetUrl} target="_blank" rel="noreferrer" className="btn-glass btn-sm">View / download</a>
            )}
          </div>
        )}
      </div>

      {/* Conversion */}
      {canConvert ? (
        <div className="card p-6">
          <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>Convert to order</p>
          <p className="mt-1 mb-4 text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>
            Creates an <strong>unpaid</strong> order with the total you enter. No payment is taken and no
            payment link is sent. Arrange payment afterwards through the normal order workflow.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
                Quote total (NZD) <span className="text-red-500">*</span>
              </label>
              <input
                type="number" min={0.01} step="0.01" value={quotedTotal}
                onChange={(e) => setQuotedTotal(e.target.value)}
                className="w-full rounded-2xl border border-black/[0.10] bg-white px-4 py-3 text-sm text-black focus:border-black/30 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">Internal note (optional)</label>
              <input
                type="text" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} maxLength={2000}
                className="w-full rounded-2xl border border-black/[0.10] bg-white px-4 py-3 text-sm text-black focus:border-black/30 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">Customer-facing note (optional)</label>
              <input
                type="text" value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} maxLength={2000}
                className="w-full rounded-2xl border border-black/[0.10] bg-white px-4 py-3 text-sm text-black focus:border-black/30 focus:outline-none"
              />
            </div>
          </div>
          <button type="button" onClick={convert} disabled={busy} className="btn-black btn-sm mt-4 disabled:opacity-40">
            {busy ? 'Converting…' : 'Convert to order'}
          </button>
        </div>
      ) : (
        <div className="card p-6">
          <p className="text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
            {isConverted
              ? 'This request has been converted to an order.'
              : isCancelled
                ? 'This request was cancelled and cannot be converted.'
                : 'This request cannot be converted in its current status.'}
          </p>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">{label}</p>
      <p className="break-words text-black/75" style={{ letterSpacing: '-0.14px' }}>{value}</p>
    </div>
  )
}
