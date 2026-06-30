'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { adminBannerEnquiriesApi } from '@/api/banner-enquiries'
import { redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import type { BannerMaterial, BannerQuoteRequest, BannerQuoteRequestStatus } from '@/types'

const MATERIAL_LABEL: Record<BannerMaterial, string> = {
  PullUp: 'Pull-up',
  Pvc: 'PVC',
  Mesh: 'Mesh',
  Fabric: 'Fabric',
  Other: 'Other',
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

export default function AdminBannerEnquiriesPage() {
  const [items, setItems] = useState<BannerQuoteRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await adminBannerEnquiriesApi.list({ maxResultCount: 100 })
      setItems(result.items ?? [])
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin('session-expired')
        return
      }
      setError(err instanceof Error ? err.message : 'Could not load banner enquiries.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function markReviewed(id: string) {
    setBusyId(id)
    try {
      const updated = await adminBannerEnquiriesApi.markReviewed(id)
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin('session-expired')
        return
      }
      setError(err instanceof Error ? err.message : 'Could not update this enquiry.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="admin-page admin-stack">
      <div>
        <h1 className="text-2xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.72px' }}>
          Banner Quote Requests
        </h1>
        <p className="mt-1 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
          Customer banner enquiries (quote-only). These are not orders and have no price or payment — review
          the requirements and design, then quote the customer through the normal order/price workflow.
        </p>
      </div>

      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-black/55">Loading…</p>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
            No banner quote requests yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                      {r.productNameSnapshot}
                    </p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.4px] ${STATUS_STYLE[r.status]}`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
                    {new Date(r.creationTime).toLocaleString()} · Ref {r.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {r.convertedOrderId && (
                    <Link href={`/admin/orders/${r.convertedOrderId}`} className="btn-glass btn-sm">
                      View order
                    </Link>
                  )}
                  {r.status === 'New' && (
                    <button
                      type="button"
                      onClick={() => markReviewed(r.id)}
                      disabled={busyId === r.id}
                      className="btn-glass btn-sm disabled:opacity-40"
                    >
                      {busyId === r.id ? 'Saving…' : 'Mark reviewed'}
                    </button>
                  )}
                  <Link href={`/admin/banner-enquiries/${r.id}`} className="btn-black btn-sm">
                    Open
                  </Link>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="Customer" value={`${r.customerName} · ${r.customerEmail}${r.customerPhone ? ` · ${r.customerPhone}` : ''}`} />
                <Detail label="Quantity" value={String(r.quantity)} />
                <Detail label="Size" value={sizeSummary(r)} />
                <Detail label="Material" value={r.material === 'Other' ? r.materialDisplayName || 'Other' : MATERIAL_LABEL[r.material]} />
                <Detail label="Finishing" value={finishingSummary(r)} />
                {r.designNote && <Detail label="Design note" value={r.designNote} />}
                {r.bannerNotes && <Detail label="Notes" value={r.bannerNotes} />}
                {r.message && <Detail label="Message" value={r.message} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">{label}</p>
      <p className="truncate text-black/75" style={{ letterSpacing: '-0.14px' }}>{value}</p>
    </div>
  )
}
