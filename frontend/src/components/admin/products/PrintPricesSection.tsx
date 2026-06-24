'use client'

import { useEffect, useMemo, useState } from 'react'
import { makeCatalogApi } from '@/api/catalog'
import { makePrintConfigApi } from '@/api/print-config'
import { adminApiClient } from '@/lib/admin-client'
import type { PrintSize, ProductPrintPriceTier } from '@/types'

const catalogApi = makeCatalogApi(adminApiClient)
const printConfigApi = makePrintConfigApi(adminApiClient)

interface Props {
  /** The product's assigned print pricing group, or null when ungrouped. */
  printPricingGroupId: string | null
  /** Distinct garment sizes from the product's variants, for size-override scopes. */
  variantSizes: string[]
}

// Sentinel for the group-default (size = null) scope.
const GROUP_DEFAULT = '__group__'

interface TierRow {
  key: string
  scope: string // GROUP_DEFAULT or a garment size string
  printSizeId: string
  minQuantity: string
  unitPrintPrice: string
  isActive: boolean
}

interface RowError {
  printSizeId?: string
  minQuantity?: string
  unitPrintPrice?: string
}

const FIELD_BASE = [
  'w-full rounded-xl border border-black/[0.10] bg-white px-3 py-2 text-sm text-black',
  'placeholder:text-black/30',
  'focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/[0.06]',
  'disabled:opacity-50',
].join(' ')

const LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55'
const UNIT_PRICE_PATTERN = /^\d+(\.\d{1,2})?$/

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `ptier-${Math.random().toString(36).slice(2)}`
}

function tiersToRows(tiers: ProductPrintPriceTier[]): TierRow[] {
  return [...tiers]
    .sort(
      (a, b) =>
        (a.size ?? '').localeCompare(b.size ?? '') ||
        a.printSizeId.localeCompare(b.printSizeId) ||
        a.minQuantity - b.minQuantity,
    )
    .map((t) => ({
      key: newKey(),
      scope: t.size ?? GROUP_DEFAULT,
      printSizeId: t.printSizeId,
      minQuantity: String(t.minQuantity),
      unitPrintPrice: t.unitPrintPrice.toFixed(2),
      isActive: t.isActive,
    }))
}

export function PrintPricesSection({ printPricingGroupId, variantSizes }: Props) {
  const [printSizes, setPrintSizes] = useState<PrintSize[]>([])
  const [rows, setRows] = useState<TierRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    if (!printPricingGroupId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    Promise.all([
      catalogApi.getPrintPriceTiers(printPricingGroupId),
      printConfigApi.getSizes(),
    ])
      .then(([tiers, sizes]) => {
        if (cancelled) return
        setPrintSizes(sizes)
        setRows(tiersToRows(tiers))
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load print prices.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [printPricingGroupId])

  const scopeOptions = useMemo(
    () => [
      { value: GROUP_DEFAULT, label: 'Group default' },
      ...variantSizes.map((s) => ({ value: s, label: `Size: ${s}` })),
    ],
    [variantSizes],
  )

  function scopeLabel(scope: string): string {
    return scopeOptions.find((o) => o.value === scope)?.label ?? `Size: ${scope}`
  }

  function printSizeLabel(id: string): string {
    return printSizes.find((s) => s.id === id)?.name ?? 'print size'
  }

  // ── Validation (mirrors backend rules) ───────────────────────────────────────
  const { rowErrors, scopeErrors, warnings, hasErrors } = useMemo(() => {
    const rowErrors: Record<string, RowError> = {}
    const scopeErrors: string[] = []
    const warnings: string[] = []

    for (const row of rows) {
      const err: RowError = {}
      if (!row.printSizeId) err.printSizeId = 'Required.'

      const minTrim = row.minQuantity.trim()
      if (minTrim === '') err.minQuantity = 'Required.'
      else if (!/^\d+$/.test(minTrim)) err.minQuantity = 'Whole number.'
      else if (parseInt(minTrim, 10) < 1) err.minQuantity = 'Must be ≥ 1.'

      const priceTrim = row.unitPrintPrice.trim()
      if (priceTrim === '') err.unitPrintPrice = 'Required.'
      else if (!UNIT_PRICE_PATTERN.test(priceTrim)) err.unitPrintPrice = 'Max 2 decimals.'
      else if (parseFloat(priceTrim) <= 0) err.unitPrintPrice = 'Must be > 0.'

      if (err.printSizeId || err.minQuantity || err.unitPrintPrice) rowErrors[row.key] = err
    }

    // Per scope = (scope, printSizeId): no duplicate MinQuantity; a MinQuantity = 1 row required.
    const byScope = new Map<string, TierRow[]>()
    for (const row of rows) {
      if (!row.printSizeId) continue
      const k = `${row.scope}|${row.printSizeId}`
      if (!byScope.has(k)) byScope.set(k, [])
      byScope.get(k)!.push(row)
    }

    for (const [k, scopeRows] of byScope) {
      const [scope, printSizeId] = k.split('|')
      const label = `${scopeLabel(scope)} · ${printSizeLabel(printSizeId)}`
      const validMins = scopeRows
        .filter((r) => /^\d+$/.test(r.minQuantity.trim()))
        .map((r) => parseInt(r.minQuantity, 10))

      const seen = new Set<number>()
      for (const m of validMins) {
        if (seen.has(m)) { scopeErrors.push(`${label}: duplicate minimum quantity ${m}.`); break }
        seen.add(m)
      }

      if (validMins.length > 0 && !validMins.includes(1))
        scopeErrors.push(`${label}: add a tier starting at quantity 1.`)

      // Soft, non-blocking: price should normally fall as quantity rises.
      const priced = scopeRows
        .filter((r) => /^\d+$/.test(r.minQuantity.trim()) && UNIT_PRICE_PATTERN.test(r.unitPrintPrice.trim()))
        .map((r) => ({ min: parseInt(r.minQuantity, 10), price: parseFloat(r.unitPrintPrice) }))
        .sort((a, b) => a.min - b.min)
      for (let i = 1; i < priced.length; i++) {
        if (priced[i].price >= priced[i - 1].price) {
          warnings.push(`${label}: price at ${priced[i].min}+ is not lower than the smaller break.`)
          break
        }
      }
    }

    const hasErrors = Object.keys(rowErrors).length > 0 || scopeErrors.length > 0
    return { rowErrors, scopeErrors, warnings, hasErrors }
  }, [rows, scopeOptions, printSizes]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Row mutations ────────────────────────────────────────────────────────────
  function addRow() {
    setSaveSuccess(false)
    setRows((prev) => [
      ...prev,
      { key: newKey(), scope: GROUP_DEFAULT, printSizeId: '', minQuantity: '', unitPrintPrice: '', isActive: true },
    ])
  }

  function updateRow(key: string, updates: Partial<Omit<TierRow, 'key'>>) {
    setSaveSuccess(false)
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...updates } : r)))
  }

  function removeRow(key: string) {
    setSaveSuccess(false)
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  // ── Save (single writer) ─────────────────────────────────────────────────────
  async function handleSave() {
    if (!printPricingGroupId) return
    setSaveError(null)
    setSaveSuccess(false)
    if (hasErrors) {
      setSaveError('Fix the highlighted issues before saving.')
      return
    }

    const tiers = rows.map((r, index) => ({
      size: r.scope === GROUP_DEFAULT ? null : r.scope,
      printSizeId: r.printSizeId,
      minQuantity: parseInt(r.minQuantity, 10),
      unitPrintPrice: parseFloat(r.unitPrintPrice),
      isActive: r.isActive,
      sortOrder: index,
    }))

    setSaving(true)
    try {
      const updated = await catalogApi.setPrintPriceTiers(printPricingGroupId, { tiers })
      setRows(tiersToRows(updated))
      setSaveSuccess(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save print prices. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
      <div className="mb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Print Pricing</p>
        <h2 className="mt-1 text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
          Print Prices
        </h2>
        <div className="mt-3 space-y-1.5 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 text-sm leading-6 text-black/60">
          <p>This sets <strong className="text-black/75">print price only</strong>. The garment/base price is unchanged.</p>
          <p>Products in the same print pricing group combine quantities for tier breaks.</p>
          <p>Different print sizes share the same group quantity threshold, but each print size uses its own price ladder.</p>
          <p className="text-black/45">PrintArea does not affect price.</p>
        </div>
      </div>

      {!printPricingGroupId ? (
        <div className="rounded-2xl border border-dashed border-black/[0.12] px-4 py-6 text-center text-sm text-black/55">
          Assign this product to a print pricing group before configuring print prices.
        </div>
      ) : loading ? (
        <div className="rounded-2xl border border-black/[0.06] px-4 py-6 text-center text-sm text-black/45">Loading…</div>
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>
      ) : (
        <>
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/[0.12] px-4 py-6 text-center text-sm text-black/55">
              No print prices configured. Printing uses each print size&apos;s base price until tiers are added.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="hidden grid-cols-[1.1fr_1.1fr_0.8fr_1fr_auto_auto] gap-3 px-1 sm:grid">
                <span className={LABEL + ' mb-0'}>Scope</span>
                <span className={LABEL + ' mb-0'}>Print size</span>
                <span className={LABEL + ' mb-0'}>Min qty</span>
                <span className={LABEL + ' mb-0'}>Unit print price</span>
                <span className={LABEL + ' mb-0'}>Active</span>
                <span className="w-8" />
              </div>

              {rows.map((row) => {
                const err = rowErrors[row.key]
                return (
                  <div
                    key={row.key}
                    className={[
                      'grid grid-cols-1 gap-3 rounded-2xl border p-3 sm:grid-cols-[1.1fr_1.1fr_0.8fr_1fr_auto_auto] sm:items-start sm:border-0 sm:bg-transparent sm:p-1',
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

                    {/* Min qty */}
                    <div>
                      <span className={LABEL + ' sm:hidden'}>Min qty</span>
                      <input
                        type="number" min={1} step={1}
                        value={row.minQuantity}
                        disabled={saving}
                        placeholder="1"
                        onChange={(e) => updateRow(row.key, { minQuantity: e.target.value })}
                        className={FIELD_BASE + (err?.minQuantity ? ' border-red-300' : '')}
                      />
                      {err?.minQuantity && <p className="mt-1 text-xs text-red-600">{err.minQuantity}</p>}
                    </div>

                    {/* Unit print price */}
                    <div>
                      <span className={LABEL + ' sm:hidden'}>Unit print price</span>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-black/40">$</span>
                        <input
                          type="number" min={0} step="0.01"
                          value={row.unitPrintPrice}
                          disabled={saving}
                          placeholder="0.00"
                          onChange={(e) => updateRow(row.key, { unitPrintPrice: e.target.value })}
                          className={FIELD_BASE + ' pl-7' + (err?.unitPrintPrice ? ' border-red-300' : '')}
                        />
                      </div>
                      {err?.unitPrintPrice && <p className="mt-1 text-xs text-red-600">{err.unitPrintPrice}</p>}
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
                        aria-label="Tier active"
                      />
                    </div>

                    {/* Delete */}
                    <div className="flex justify-end sm:pt-0.5">
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        disabled={saving}
                        aria-label="Remove tier"
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
              + Add tier
            </button>
          </div>

          {scopeErrors.length > 0 && (
            <ul className="mt-4 space-y-1 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {scopeErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          {warnings.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          {saveError && (
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</p>
          )}
          {saveSuccess && !saveError && (
            <p className="mt-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {rows.length === 0 ? 'Print prices cleared — printing uses each print size base price.' : 'Print prices saved.'}
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
              {saving ? 'Saving…' : 'Save Print Prices'}
            </button>
            <p className="text-xs text-black/40" style={{ letterSpacing: '-0.14px' }}>
              Saved per pricing group, separately from the product, variants, and inventory.
            </p>
          </div>
        </>
      )}
    </section>
  )
}
