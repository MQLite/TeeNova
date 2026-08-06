'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { adminQuoteRequestsApi } from '@/api/quote-requests'
import { ApiError } from '@/lib/api-client'
import { redirectToLogin } from '@/lib/admin-client'
import type { QuoteRequest } from '@/types'

export function QuoteRequestDetailClient({ role }: { role?: string }) {
  const { id } = useParams<{ id: string }>()
  const [quote, setQuote] = useState<QuoteRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canWrite = role === 'Admin'
  const handle = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
    setError(err instanceof Error ? err.message : 'The request could not be completed.')
  }, [])
  const load = useCallback(async () => { setLoading(true); setError(null); try { setQuote(await adminQuoteRequestsApi.get(id)) } catch (err) { handle(err) } finally { setLoading(false) } }, [handle, id])
  useEffect(() => { void load() }, [load])
  const act = async (action: () => Promise<QuoteRequest>) => { setBusy(true); setError(null); try { setQuote(await action()) } catch (err) { handle(err) } finally { setBusy(false) } }
  if (loading) return <div className="admin-page"><p className="text-sm text-black/55">Loading…</p></div>
  if (!quote) return <div className="admin-page admin-stack"><p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error ?? 'Quote request not found.'}</p><Link className="btn-glass btn-sm w-fit" href="/admin/quote-requests">Back</Link></div>
  return <div className="admin-page admin-stack">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl text-black">{quote.reference}</h1><p className="mt-1 text-sm text-black/55">{quote.serviceType === 'Other' ? quote.serviceTypeOther : quote.serviceType} · {quote.status} · {new Date(quote.creationTime).toLocaleString()}</p></div><div className="flex flex-wrap gap-2"><Link className="btn-glass btn-sm" href="/admin/quote-requests">Back</Link>{canWrite && quote.status === 'New' && <button disabled={busy} className="btn-glass btn-sm" onClick={() => void act(() => adminQuoteRequestsApi.markReviewed(id))}>Mark reviewed</button>}{canWrite && (quote.status === 'New' || quote.status === 'Reviewed') && <><button disabled={busy} className="btn-glass btn-sm" onClick={() => void act(() => adminQuoteRequestsApi.cancel(id))}>Cancel</button><button disabled={busy} className="btn-glass btn-sm" onClick={() => void act(() => adminQuoteRequestsApi.markSpam(id))}>Mark spam</button></>}</div></div>
    {!canWrite && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Viewer access is read-only. Attachment content and mutations require Admin.</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <section className="card p-6"><h2 className="text-base text-black">Request details</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Detail label="Customer" value={quote.customerName} /><Detail label="Email" value={quote.customerEmail} /><Detail label="Phone" value={quote.customerPhone} /><Detail label="Organisation" value={quote.organisationName} /><Detail label="Product" value={quote.productNameSnapshot} /><Detail label="Quantity" value={quote.quantity?.toString()} /><Detail label="Dimensions" value={quote.width && quote.height ? `${quote.width} × ${quote.height} ${quote.dimensionUnit}` : null} /><Detail label="Required date" value={quote.requiredDate?.slice(0, 10)} /><Detail label="Fulfilment" value={quote.fulfilmentPreference} /><Detail label="Delivery suburb" value={quote.deliverySuburb} /><Detail label="Source" value={quote.sourcePath} /><Detail label="Notes" value={quote.notes} /></dl></section>
    <section className="card p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base text-black">Notification status</h2><p className="mt-1 text-sm text-black/55">Internal: {quote.internalNotificationStatus} · Customer: {quote.customerAcknowledgementStatus}</p></div>{canWrite && <div className="flex gap-2">{quote.internalNotificationStatus === 'Failed' && <button className="btn-glass btn-sm" disabled={busy} onClick={() => void act(() => adminQuoteRequestsApi.resend(id, 'internal'))}>Resend internal</button>}{quote.customerAcknowledgementStatus === 'Failed' && <button className="btn-glass btn-sm" disabled={busy} onClick={() => void act(() => adminQuoteRequestsApi.resend(id, 'customer'))}>Resend customer</button>}</div>}</div></section>
    <section className="card p-6"><h2 className="text-base text-black">Private artwork</h2>{quote.attachments.length === 0 ? <p className="mt-3 text-sm text-black/55">No artwork attached.</p> : <ul className="mt-3 space-y-2">{quote.attachments.map((file) => <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/[0.04] p-3 text-sm"><div><p className="break-all text-black">{file.fileName}</p><p className="text-xs text-black/50">{file.contentType} · {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB · {file.scanStatus === 'NotScanned' ? 'Not malware-scanned' : file.scanStatus}</p></div>{canWrite && <a className="btn-black btn-sm" href={adminQuoteRequestsApi.attachmentDownloadUrl(id, file.id)}>Download</a>}</li>)}</ul>}</section>
  </div>
}

function Detail({ label, value }: { label: string; value?: string | null }) { return <div><dt className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">{label}</dt><dd className="mt-1 break-words text-sm text-black/75">{value || '—'}</dd></div> }
