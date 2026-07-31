'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createAiOrderImport,
  listAiOrderImports,
  type AiOrderImportSummary,
} from '@/api/ai-order-imports'

export function AiOrderImportListClient() {
  const router = useRouter()
  const [items, setItems] = useState<AiOrderImportSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string>()
  const pendingCreate = useRef<{ key: string; captureSessionId: string }>()

  useEffect(() => {
    listAiOrderImports()
      .then(setItems)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  async function createImport() {
    if (creating) return
    setCreating(true)
    setError(undefined)
    const request = pendingCreate.current ?? (() => {
      const captureSessionId = crypto.randomUUID()
      return {
        key: `create-${captureSessionId}`,
        captureSessionId,
      }
    })()
    pendingCreate.current = request
    try {
      const created = await createAiOrderImport(
        request.key,
        request.captureSessionId,
      )
      pendingCreate.current = undefined
      router.push(`/admin/ai-order-imports/${created.id}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the import.')
      setCreating(false)
    }
  }

  return (
    <div className="admin-page admin-stack">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
            Admin intake
          </p>
          <h1 className="mt-1 text-2xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
            AI Order Imports
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-black/55">
            Photograph or upload handwritten order forms. Recognition has not started yet.
          </p>
        </div>
        <button
          type="button"
          onClick={createImport}
          disabled={creating}
          className="rounded-full bg-black px-5 py-2.5 text-sm text-white transition-opacity disabled:opacity-50"
        >
          {creating ? 'Starting…' : 'Scan Handwritten Order'}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="border-b border-black/[0.08] px-5 py-4">
          <h2 className="text-sm text-black" style={{ fontWeight: 520 }}>Recent incomplete imports</h2>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-sm text-black/50">Loading imports…</p>
        ) : items.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-black/55">No AI order imports yet.</p>
            <p className="mt-1 text-xs text-black/40">Start with a camera photo or an existing file.</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/admin/ai-order-imports/${item.id}`}
                className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-black/[0.02] sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-black">
                    Import {item.id.slice(0, 8).toUpperCase()}
                  </p>
                  <p className="mt-1 text-xs text-black/50">
                    {new Date(item.creationTime).toLocaleString('en-NZ')} · {item.sourceDocumentCount}{' '}
                    source{item.sourceDocumentCount === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="w-fit rounded-full border border-black/[0.10] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
                  {item.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
