'use client'

import { useEffect, useMemo, useState } from 'react'
import { makeCatalogApi } from '@/api/catalog'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import type { ProductQuantityPriceTier } from '@/types'

const catalogApi = makeCatalogApi(adminApiClient)

const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/

interface Props {
  productId: string
  /** Product minimum quantity (Jira 9503) — surfaced so the admin keeps the lowest break sensible. */
  minimumQuantity: number
  embedded?: boolean
}

/** Editable row. Stable client id keeps inputs from remounting as rows are added/removed. */
interface TierRow {
  rowId: string
  minQuantity: string
  unitPrice: string
  isActive: boolean
}

let rowSeq = 0
function newRow(partial?: Partial<TierRow>): TierRow {
  rowSeq += 1
  return { rowId: `r${rowSeq}`, minQuantity: '', unitPrice: '', isActive: true, ...partial }
}

function rowsFromTiers(tiers: ProductQuantityPriceTier[]): TierRow[] {
  const sorted = [...tiers].sort((a, b) => a.sortOrder - b.sortOrder || a.minQuantity - b.minQuantity)
  if (sorted.length === 0) return [newRow()]
  return sorted.map((t) =>
    newRow({ minQuantity: String(t.minQuantity), unitPrice: t.unitPrice.toFixed(2), isActive: t.isActive }),
  )
}

/**
 * Badge quantity-tier unit price editor (Jira 9504). Saves through the dedicated single-writer
 * `setQuantityPriceTiers` endpoint only — it never goes through the product update, so ordinary
 * product saves can't clobber the tiers and saving tiers can't clobber product fields.
 */
export function BadgeQuantityPricesSection({ productId, minimumQuantity, embedded = false }: Props) {
  const [rows, setRows] = useState<TierRow[]>([newRow()])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setSaveError(null)
    setSaveSuccess(false)

    catalogApi.getQuantityPriceTiers(productId)
      .then((tiers) => {
        if (cancelled) return
        setRows(rowsFromTiers(tiers))
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load quantity prices.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [productId])

  const validation = useMemo(() => {
    const rowErrors = new Set<string>()
    const messages: string[] = []
    const warnings: string[] = []

    // Only filled rows are validated/saved; a fully blank row is ignored.
    const filled = rows.filter((r) => r.minQuantity.trim() !== '' || r.unitPrice.trim() !== '')

    const seenMin = new Set<number>()
    filled.forEach((r) => {
      const minStr = r.minQuantity.trim()
      const priceStr = r.unitPrice.trim()
      let rowBad = false

      if (!/^\d+$/.test(minStr) || parseInt(minStr, 10) < 1) {
        rowBad = true
      } else {
        const min = parseInt(minStr, 10)
        if (seenMin.has(min)) { rowBad = true; messages.push(`Quantity ${min} appears more than once.`) }
        seenMin.add(min)
      }
      if (!PRICE_PATTERN.test(priceStr) || parseFloat(priceStr) <= 0) {
        rowBad = true
      }
      if (rowBad) rowErrors.add(r.rowId)
    })

    if (filled.length === 0) {
      messages.push('Add at least one quantity tier so the Badge has a resolvable price.')
    }

    // Lowest break should be ≤ minimum quantity, else a min-qty order has no applicable tier.
    const validMins = filled
      .filter((r) => /^\d+$/.test(r.minQuantity.trim()))
      .map((r) => parseInt(r.minQuantity.trim(), 10))
    if (validMins.length > 0) {
      const lowest = Math.min(...validMins)
      if (lowest > minimumQuantity) {
        warnings.push(`Lowest tier (${lowest}) is above the minimum quantity (${minimumQuantity}); orders at the minimum would fall back to this tier.`)
      }
    }

    // Unit price should decrease as quantity grows (volume discount). Warn only — not blocking.
    const priced = filled
      .filter((r) => /^\d+$/.test(r.minQuantity.trim()) && PRICE_PATTERN.test(r.unitPrice.trim()))
      .map((r) => ({ min: parseInt(r.minQuantity.trim(), 10), price: parseFloat(r.unitPrice.trim()) }))
      .sort((a, b) => a.min - b.min)
    for (let i = 1; i < priced.length; i++) {
      if (priced[i].price >= priced[i - 1].price) {
        warnings.push(`Price at ${priced[i].min}+ is not lower than the previous break.`)
        break
      }
    }

    return { rowErrors, messages, warnings, hasErrors: rowErrors.size > 0 || filled.length === 0 }
  }, [rows, minimumQuantity])

  function updateRow(rowId: string, patch: Partial<TierRow>) {
    setSaveSuccess(false)
    setSaveError(null)
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setSaveSuccess(false)
    setSaveError(null)
    setRows((prev) => [...prev, newRow()])
  }

  function removeRow(rowId: string) {
    setSaveSuccess(false)
    setSaveError(null)
    setRows((prev) => {
      const next = prev.filter((r) => r.rowId !== rowId)
      return next.length === 0 ? [newRow()] : next
    })
  }

  async function handleSave() {
    setSaveError(null)
    setSaveSuccess(false)

    if (validation.hasErrors) {
      setSaveError('Fix the highlighted rows before saving. Each tier needs a whole-number quantity (≥ 1) and a price greater than 0.')
      return
    }

    const filled = rows.filter((r) => r.minQuantity.trim() !== '' || r.unitPrice.trim() !== '')
    const tiers = [...filled]
      .map((r) => ({ min: parseInt(r.minQuantity.trim(), 10), price: parseFloat(r.unitPrice.trim()), isActive: r.isActive }))
      .sort((a, b) => a.min - b.min)
      .map((t, index) => ({
        minQuantity: t.min,
        unitPrice: t.price,
        isActive: t.isActive,
        sortOrder: index,
      }))

    setSaving(true)
    try {
      const updated = await catalogApi.setQuantityPriceTiers(productId, { tiers })
      setRows(rowsFromTiers(updated))
      setSaveSuccess(true)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
      setSaveError(err instanceof Error ? err.message : 'Could not save quantity prices. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={embedded ? 'space-y-4' : 'rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card'}>
      <div className="mb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Badge Pricing</p>
        <h3 className="mt-1 text-base text-black" style={{ fontWeight: 540 }}>
          Quantity-tier unit prices
        </h3>
        <div className="mt-3 space-y-1.5 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 text-sm leading-6 text-black/60">
          <p>Each tier is a minimum quantity and the per-unit price at or above that quantity.</p>
          <p>The highest tier whose quantity ≤ the order quantity wins; line total = unit price × quantity.</p>
          <p>Saved through a dedicated endpoint, separately from product fields. Backend remains the pricing authority.</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-black/[0.06] px-4 py-6 text-center text-sm text-black/45">Loading…</div>
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-black/[0.08]">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-black/[0.02]">
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Min Quantity</th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Unit Price</th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Active</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const hasError = validation.rowErrors.has(row.rowId)
                  return (
                    <tr key={row.rowId} className="border-t border-black/[0.06]">
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={row.minQuantity}
                          disabled={saving}
                          onChange={(e) => updateRow(row.rowId, { minQuantity: e.target.value })}
                          aria-label="Minimum quantity"
                          placeholder="e.g. 50"
                          className={[
                            'w-32 rounded-xl border bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:outline-none focus:ring-2',
                            hasError ? 'border-red-300 focus:border-red-300 focus:ring-red-100' : 'border-black/[0.10] focus:border-black/30 focus:ring-black/[0.06]',
                          ].join(' ')}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative w-36">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-black/40">$</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.unitPrice}
                            disabled={saving}
                            onChange={(e) => updateRow(row.rowId, { unitPrice: e.target.value })}
                            aria-label="Unit price"
                            placeholder="0.00"
                            className={[
                              'w-full rounded-xl border bg-white py-2 pl-7 pr-3 text-sm text-black placeholder:text-black/30 focus:outline-none focus:ring-2',
                              hasError ? 'border-red-300 focus:border-red-300 focus:ring-red-100' : 'border-black/[0.10] focus:border-black/30 focus:ring-black/[0.06]',
                            ].join(' ')}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={row.isActive}
                          disabled={saving}
                          onClick={() => updateRow(row.rowId, { isActive: !row.isActive })}
                          className={[
                            'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors',
                            row.isActive ? 'border-green-200 bg-green-50 text-green-800' : 'border-black/[0.10] bg-black/[0.02] text-black/50',
                          ].join(' ')}
                          style={{ fontWeight: 480 }}
                        >
                          <span className={['h-1.5 w-1.5 rounded-full', row.isActive ? 'bg-green-500' : 'bg-black/25'].join(' ')} />
                          {row.isActive ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeRow(row.rowId)}
                          disabled={saving}
                          className="text-[11px] text-red-600 transition-opacity hover:opacity-70 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addRow}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-full border border-black/[0.12] bg-white px-4 py-2 text-sm text-black/70 transition-colors hover:border-black/30 hover:text-black disabled:opacity-40"
            style={{ fontWeight: 480 }}
          >
            Add Tier
          </button>

          {validation.messages.length > 0 && (
            <ul className="space-y-1 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {validation.messages.map((msg, i) => <li key={i}>{msg}</li>)}
            </ul>
          )}
          {validation.rowErrors.size > 0 && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Each tier needs a whole-number quantity (≥ 1) and a unit price greater than 0 (up to 2 decimals).
            </p>
          )}
          {validation.warnings.length > 0 && (
            <ul className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {validation.warnings.map((warning, i) => <li key={i}>{warning}</li>)}
            </ul>
          )}
          {saveError && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</p>
          )}
          {saveSuccess && !saveError && (
            <p className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              Quantity price tiers saved.
            </p>
          )}

          <div className="flex items-center gap-3 border-t border-black/[0.06] pt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || validation.hasErrors}
              className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm text-white transition-opacity hover:opacity-85 disabled:opacity-40"
              style={{ fontWeight: 480 }}
            >
              {saving ? 'Saving…' : 'Save Quantity Tiers'}
            </button>
            <p className="text-xs text-black/40">
              Saved separately from product fields. Empty (all rows blank) is rejected — a Badge needs at least one tier.
            </p>
          </div>
        </>
      )}
    </section>
  )
}
