'use client'

import { useEffect, useMemo, useState } from 'react'
import { makeCatalogApi } from '@/api/catalog'
import { makePrintConfigApi } from '@/api/print-config'
import { adminApiClient } from '@/lib/admin-client'
import type { PrintArea, PrintSize, ProductPrintConfigOption } from '@/types'

const catalogApi = makeCatalogApi(adminApiClient)
const printConfigApi = makePrintConfigApi(adminApiClient)

interface Props {
  productId: string
  /** Distinct garment sizes from the product's variants, for size-override scopes. */
  variantSizes: string[]
}

// Sentinel for the product-default (size = null) scope.
const PRODUCT_DEFAULT = '__product__'

interface OptionRow {
  key: string
  scope: string // PRODUCT_DEFAULT or a garment size string
  printAreaId: string
  printSizeId: string
  isActive: boolean
}

interface RowError {
  printAreaId?: string
  printSizeId?: string
}

const FIELD_BASE = [
  'w-full rounded-xl border border-black/[0.10] bg-white px-3 py-2 text-sm text-black',
  'placeholder:text-black/30',
  'focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/[0.06]',
  'disabled:opacity-50',
].join(' ')

const LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55'

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `popt-${Math.random().toString(36).slice(2)}`
}

function optionsToRows(options: ProductPrintConfigOption[]): OptionRow[] {
  return [...options]
    .sort(
      (a, b) =>
        (a.size ?? '').localeCompare(b.size ?? '') ||
        a.printAreaId.localeCompare(b.printAreaId) ||
        a.printSizeId.localeCompare(b.printSizeId),
    )
    .map((o) => ({
      key: newKey(),
      scope: o.size ?? PRODUCT_DEFAULT,
      printAreaId: o.printAreaId,
      printSizeId: o.printSizeId,
      isActive: o.isActive,
    }))
}

export function PrintOptionsSection({ productId, variantSizes }: Props) {
  const [areas, setAreas] = useState<PrintArea[]>([])
  const [printSizes, setPrintSizes] = useState<PrintSize[]>([])
  const [rows, setRows] = useState<OptionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    Promise.all([
      catalogApi.getProductPrintConfigOptions(productId),
      printConfigApi.getAreas(),
      printConfigApi.getSizes(),
    ])
      .then(([options, loadedAreas, loadedSizes]) => {
        if (cancelled) return
        setAreas(loadedAreas)
        setPrintSizes(loadedSizes)
        setRows(optionsToRows(options))
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load print options.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [productId])

  const scopeOptions = useMemo(
    () => [
      { value: PRODUCT_DEFAULT, label: 'Product default' },
      ...variantSizes.map((s) => ({ value: s, label: `Size: ${s}` })),
    ],
    [variantSizes],
  )

  function scopeLabel(scope: string): string {
    return scopeOptions.find((o) => o.value === scope)?.label ?? `Size: ${scope}`
  }

  // ── Validation ───────────────────────────────────────────────────────────────
  const { rowErrors, dupErrors, hasErrors } = useMemo(() => {
    const rowErrors: Record<string, RowError> = {}
    const dupErrors: string[] = []

    for (const row of rows) {
      const err: RowError = {}
      if (!row.printAreaId) err.printAreaId = 'Required.'
      if (!row.printSizeId) err.printSizeId = 'Required.'
      if (err.printAreaId || err.printSizeId) rowErrors[row.key] = err
    }

    const seen = new Set<string>()
    for (const row of rows) {
      if (!row.printAreaId || !row.printSizeId) continue
      const k = `${row.scope}|${row.printAreaId}|${row.printSizeId}`
      if (seen.has(k)) {
        dupErrors.push(`${scopeLabel(row.scope)}: duplicate area + size combination.`)
        break
      }
      seen.add(k)
    }

    const hasErrors = Object.keys(rowErrors).length > 0 || dupErrors.length > 0
    return { rowErrors, dupErrors, hasErrors }
  }, [rows, scopeOptions]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Row mutations ────────────────────────────────────────────────────────────
  function addRow() {
    setSaveSuccess(false)
    setRows((prev) => [
      ...prev,
      { key: newKey(), scope: PRODUCT_DEFAULT, printAreaId: '', printSizeId: '', isActive: true },
    ])
  }

  function updateRow(key: string, updates: Partial<Omit<OptionRow, 'key'>>) {
    setSaveSuccess(false)
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...updates } : r)))
  }

  function removeRow(key: string) {
    setSaveSuccess(false)
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  // ── Save (single writer) ─────────────────────────────────────────────────────
  async function handleSave() {
    setSaveError(null)
    setSaveSuccess(false)
    if (hasErrors) {
      setSaveError('Fix the highlighted issues before saving.')
      return
    }

    const options = rows.map((r, index) => ({
      size: r.scope === PRODUCT_DEFAULT ? null : r.scope,
      printAreaId: r.printAreaId,
      printSizeId: r.printSizeId,
      isActive: r.isActive,
      sortOrder: index,
    }))

    setSaving(true)
    try {
      const updated = await catalogApi.setProductPrintConfigOptions(productId, { options })
      setRows(optionsToRows(updated))
      setSaveSuccess(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save print options. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
      <div className="mb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Print Configuration</p>
        <h2 className="mt-1 text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
          Print Options
        </h2>
        <div className="mt-3 space-y-1.5 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 text-sm leading-6 text-black/60">
          <p>These options control <strong className="text-black/75">what customers are allowed to select</strong>.</p>
          <p>They do not control price — print prices are configured in Print Prices.</p>
          <p>If no scoped options are configured, this product uses the global print area/size matrix.</p>
          <p className="text-black/45">A size override replaces the product default for that garment size.</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-black/[0.06] px-4 py-6 text-center text-sm text-black/45">Loading…</div>
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>
      ) : (
        <>
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/[0.12] px-4 py-6 text-center text-sm text-black/55">
              No scoped options configured. This product uses the global print area/size matrix.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="hidden grid-cols-[1.1fr_1.1fr_1.1fr_auto_auto] gap-3 px-1 sm:grid">
                <span className={LABEL + ' mb-0'}>Scope</span>
                <span className={LABEL + ' mb-0'}>Print area</span>
                <span className={LABEL + ' mb-0'}>Print size</span>
                <span className={LABEL + ' mb-0'}>Active</span>
                <span className="w-8" />
              </div>

              {rows.map((row) => {
                const err = rowErrors[row.key]
                return (
                  <div
                    key={row.key}
                    className={[
                      'grid grid-cols-1 gap-3 rounded-2xl border p-3 sm:grid-cols-[1.1fr_1.1fr_1.1fr_auto_auto] sm:items-start sm:border-0 sm:bg-transparent sm:p-1',
                      row.isActive ? 'border-black/[0.06] bg-black/[0.01]' : 'border-black/[0.06] bg-black/[0.02] opacity-60',
                    ].join(' ')}
                  >
                    {/* Scope */}
                    <div>
                      <span className={LABEL + ' sm:hidden'}>Scope</span>
                      <select
                        value={row.scope}
                        disabled={saving}
                        onChange={(e) => updateRow(row.key, { scope: e.target.value })}
                        className={FIELD_BASE}
                      >
                        {scopeOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Print area */}
                    <div>
                      <span className={LABEL + ' sm:hidden'}>Print area</span>
                      <select
                        value={row.printAreaId}
                        disabled={saving}
                        onChange={(e) => updateRow(row.key, { printAreaId: e.target.value })}
                        className={FIELD_BASE + (err?.printAreaId ? ' border-red-300' : '')}
                      >
                        <option value="">Select…</option>
                        {areas.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                      {err?.printAreaId && <p className="mt-1 text-xs text-red-600">{err.printAreaId}</p>}
                    </div>

                    {/* Print size */}
                    <div>
                      <span className={LABEL + ' sm:hidden'}>Print size</span>
                      <select
                        value={row.printSizeId}
                        disabled={saving}
                        onChange={(e) => updateRow(row.key, { printSizeId: e.target.value })}
                        className={FIELD_BASE + (err?.printSizeId ? ' border-red-300' : '')}
                      >
                        <option value="">Select…</option>
                        {printSizes.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      {err?.printSizeId && <p className="mt-1 text-xs text-red-600">{err.printSizeId}</p>}
                    </div>

                    {/* Active */}
                    <div className="flex items-center sm:justify-center sm:pt-2">
                      <span className={LABEL + ' sm:hidden'}>Active</span>
                      <input
                        type="checkbox"
                        checked={row.isActive}
                        disabled={saving}
                        onChange={(e) => updateRow(row.key, { isActive: e.target.checked })}
                        className="h-4 w-4 rounded border-black/20"
                        aria-label="Option active"
                      />
                    </div>

                    {/* Delete */}
                    <div className="flex justify-end sm:pt-0.5">
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        disabled={saving}
                        aria-label="Remove option"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.08] text-black/45 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={addRow}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full border border-black/[0.12] bg-white px-4 py-2 text-sm text-black/70 transition-colors hover:border-black/30 hover:text-black disabled:opacity-40"
              style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
            >
              + Add option
            </button>
          </div>

          {dupErrors.length > 0 && (
            <ul className="mt-4 space-y-1 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {dupErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          {saveError && (
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</p>
          )}
          {saveSuccess && !saveError && (
            <p className="mt-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {rows.length === 0 ? 'Scoped options cleared — this product now uses the global matrix.' : 'Print options saved.'}
            </p>
          )}

          <div className="mt-4 flex items-center gap-3 border-t border-black/[0.06] pt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || hasErrors}
              className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm text-white transition-opacity hover:opacity-85 disabled:opacity-40"
              style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
            >
              {saving ? 'Saving…' : 'Save Print Options'}
            </button>
            <p className="text-xs text-black/40" style={{ letterSpacing: '-0.14px' }}>
              Selectability only — never affects price. Saved separately from product, variants, and inventory.
            </p>
          </div>
        </>
      )}
    </section>
  )
}
