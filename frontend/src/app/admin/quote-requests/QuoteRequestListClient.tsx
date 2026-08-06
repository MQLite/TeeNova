'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { adminQuoteRequestsApi } from '@/api/quote-requests'
import { ApiError } from '@/lib/api-client'
import { redirectToLogin } from '@/lib/admin-client'
import type { QuoteRequestStatus, QuoteRequestSummary, QuoteServiceType } from '@/types'
import { SERVICE_OPTIONS } from '@/app/quote/quote-form-validation'

const statuses: QuoteRequestStatus[] = ['New', 'Reviewed', 'Quoted', 'Closed', 'Cancelled', 'Spam']
const PAGE_SIZE = 25

export function QuoteRequestListClient({ role }: { role?: string }) {
  const [items, setItems] = useState<QuoteRequestSummary[]>([])
  const [status, setStatus] = useState<QuoteRequestStatus | ''>('')
  const [serviceType, setServiceType] = useState<QuoteServiceType | ''>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const result = await adminQuoteRequestsApi.list({ status: status || undefined, serviceType: serviceType || undefined, skipCount: page * PAGE_SIZE, maxResultCount: PAGE_SIZE })
      setItems(result.items ?? [])
      setTotalCount(result.totalCount)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
      setError(err instanceof Error ? err.message : 'Could not load quote requests.')
    } finally { setLoading(false) }
  }, [page, serviceType, status])
  useEffect(() => { void load() }, [load])

  return <div className="admin-page admin-stack">
    <div><h1 className="text-2xl text-black">Quote Requests</h1><p className="mt-1 text-sm text-black/55">General customer enquiries. They are not orders and contain no authoritative price or payment state.</p></div>
    <div className="card grid gap-3 p-4 sm:grid-cols-2">
      <label className="text-sm text-black/60">Status<select className="mt-1 min-h-11 w-full rounded-xl border border-black/15 px-3" value={status} onChange={(e) => { setPage(0); setStatus(e.target.value as QuoteRequestStatus | '') }}><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="text-sm text-black/60">Service<select className="mt-1 min-h-11 w-full rounded-xl border border-black/15 px-3" value={serviceType} onChange={(e) => { setPage(0); setServiceType(e.target.value as QuoteServiceType | '') }}><option value="">All services</option>{SERVICE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    </div>
    {role === 'Viewer' && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Viewer access is read-only. Status changes and attachment downloads require Admin.</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <p className="text-sm text-black/55">Loading…</p> : items.length === 0 ? <div className="card p-8 text-center text-sm text-black/55">No matching quote requests.</div> : <div className="space-y-3">{items.map((item) => <article key={item.id} className="card p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-base text-black">{item.reference}</h2><Status value={item.status} /></div><p className="mt-1 text-sm text-black/60">{labelService(item.serviceType)} · {item.customerName} · {item.customerEmail}</p><p className="mt-1 text-xs text-black/55">Quantity: {item.quantity ?? 'Not supplied'} · Required: {item.requiredDate ? new Date(item.requiredDate).toLocaleDateString() : 'Not supplied'} · Attachments: {item.attachmentCount}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">{new Date(item.creationTime).toLocaleString()}</p></div><Link className="btn-black btn-sm" href={`/admin/quote-requests/${item.id}`}>Open</Link></div><div className="mt-4 flex flex-wrap gap-2 text-xs text-black/55"><span>Internal: {item.internalNotificationStatus}</span><span aria-hidden="true">·</span><span>Customer: {item.customerAcknowledgementStatus}</span></div></article>)}</div>}
    {totalCount > PAGE_SIZE && <nav aria-label="Quote request pages" className="flex items-center justify-between"><button type="button" className="btn-glass min-h-11" disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><span className="text-sm text-black/55">Page {page + 1} of {Math.ceil(totalCount / PAGE_SIZE)}</span><button type="button" className="btn-glass min-h-11" disabled={(page + 1) * PAGE_SIZE >= totalCount || loading} onClick={() => setPage((value) => value + 1)}>Next</button></nav>}
  </div>
}

const labelService = (value: QuoteServiceType) => SERVICE_OPTIONS.find((item) => item.value === value)?.label ?? value
function Status({ value }: { value: QuoteRequestStatus }) { return <span className="rounded-full border border-black/10 bg-black/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-wide">{value}</span> }
