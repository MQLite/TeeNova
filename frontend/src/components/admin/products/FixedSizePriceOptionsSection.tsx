'use client'

import { useEffect, useMemo, useState } from 'react'
import { makeCatalogApi } from '@/api/catalog'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import type { BannerDimensionUnit, ProductFixedSizePriceOption } from '@/types'

const catalogApi = makeCatalogApi(adminApiClient)

const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/
const DIMENSION_PATTERN = /^\d+(\.\d{1,4})?$/

const UNIT_OPTIONS: { value: BannerDimensionUnit; label: string }[] = [
  { value: 'Mm', label: 'mm' },
  { value: 'Cm', label: 'cm' },
  { value: 'M', label: 'm' },
]

interface Props {
  productId: string
  /** Product minimum quantity (Jira 9517) — surfaced for admin context. */
  minimumQuantity: number
  embedded?: boolean
}

/** Editable row. Stable client id keeps inputs from remounting as rows are added/removed. */
interface OptionRow {
  rowId: string
  label: string
  width: string
  height: string
  unit: BannerDimensionUnit
  unitPrice: string
  isActive: boolean
}

let rowSeq = 0
function newRow(partial?: Partial<OptionRow>): OptionRow {
  rowSeq += 1
  return { rowId: `f${rowSeq}`, label: '', width: '', height: '', unit: 'Mm', unitPrice: '', isActive: true, ...partial }
}

function rowsFromOptions(options: ProductFixedSizePriceOption[]): OptionRow[] {
  const sorted = [...options].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
  if (sorted.length === 0) return [newRow()]
  return sorted.map((o) =>
    newRow({
      label: o.label,
      width: String(o.width),
      height: String(o.height),
      unit: o.unit,
      unitPrice: o.unitPrice.toFixed(2),
      isActive: o.isActive,
    }),
  )
}

/**
 * Banner fixed-size price options editor (Jira 9517). Saves through the dedicated single-writer
 * `setFixedSizePriceOptions` endpoint only — it never goes through the product update, so ordinary
 * product saves can't clobber the options and saving options can't clobber product fields. Mirrors the
 * Badge quantity-tier editor pattern. The backend gates writes to Banner + FixedSize products and the
 * Admin role, and remains the pricing authority.
 */
export function FixedSizePriceOptionsSection({ productId, minimumQuantity, embedded = false }: Props) {
  const [rows, setRows] = useState<OptionRow[]>([newRow()])
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

    catalogApi.getFixedSizePriceOptions(productId)
      .then((options) => {
        if (cancelled) return
        setRows(rowsFromOptions(options))
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load fixed-size options.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [productId])

  const validation = useMemo(() => {
    const rowErrors = new Set<string>()
    const messages: string[] = []

    // Only rows with any filled field are validated/saved; a fully blank row is ignored.
    const filled = rows.filter(
      (r) => r.label.trim() !== '' || r.width.trim() !== '' || r.height.trim() !== '' || r.unitPrice.trim() !== '',
    )

    filled.forEach((r) => {
      let rowBad = false
      if (r.label.trim() === '') rowBad = true
      if (!DIMENSION_PATTERN.test(r.width.trim()) || parseFloat(r.width.trim()) <= 0) rowBad = true
      if (!DIMENSION_PATTERN.test(r.height.trim()) || parseFloat(r.height.trim()) <= 0) rowBad = true
      if (!PRICE_PATTERN.test(r.unitPrice.trim()) || parseFloat(r.unitPrice.trim()) < 0.01) rowBad = true
      if (rowBad) rowErrors.add(r.rowId)
    })

    if (filled.length === 0) {
      messages.push('Add at least one fixed-size option so customers have a size to select.')
    }

    const hasActive = filled.some((r) => r.isActive && !rowErrors.has(r.rowId))
    const warnings: string[] = []
    if (filled.length > 0 && !hasActive) {
      warnings.push('No option is active — customers won’t be able to select a size or get a price until at least one is active.')
    }

    return { rowErrors, messages, warnings, hasErrors: rowErrors.size > 0 || filled.length === 0 }
  }, [rows])

  function updateRow(rowId: string, patch: Partial<OptionRow>) {
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
      setSaveError('Fix the highlighted rows before saving. Each option needs a label, width > 0, height > 0, a unit, and a unit price of at least $0.01.')
      return
    }

    const filled = rows.filter(
      (r) => r.label.trim() !== '' || r.width.trim() !== '' || r.height.trim() !== '' || r.unitPrice.trim() !== '',
    )
    const options = filled.map((r, index) => ({
      label: r.label.trim(),
      width: parseFloat(r.width.trim()),
      height: parseFloat(r.height.trim()),
      unit: r.unit,
      unitPrice: parseFloat(r.unitPrice.trim()),
      isActive: r.isActive,
      sortOrder: index,
    }))

    setSaving(true)
    try {
      const updated = await catalogApi.setFixedSizePriceOptions(productId, { options })
      setRows(rowsFromOptions(updated))
      setSaveSuccess(true)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
      setSaveError(err instanceof Error ? err.message : 'Could not save fixed-size options. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={embedded ? 'space-y-4' : 'rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card'}>
      <div className="mb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Banner Pricing</p>
        <h3 className="mt-1 text-base text-black" style={{ fontWeight: 540 }}>
          Fixed-size price options
        </h3>
        <div className="mt-3 space-y-1.5 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 text-sm leading-6 text-black/60">
          <p>Fixed-size Banner products are automatically priced from these preset size options.</p>
          <p>Each option is a labelled standard size with a unit price; the customer picks one active option and the line total is unit price × quantity.</p>
          <p>Saved through a dedicated endpoint, separately from product fields. Backend remains the pricing authority. Minimum order quantity is {minimumQuantity}.</p>
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
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Label</th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Width</th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Height</th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Unit</th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Unit Price</th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Active</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const hasError = validation.rowErrors.has(row.rowId)
                  const cellBorder = hasError
                    ? 'border-red-300 focus:border-red-300 focus:ring-red-100'
                    : 'border-black/[0.10] focus:border-black/30 focus:ring-black/[0.06]'
                  return (
                    <tr key={row.rowId} className="border-t border-black/[0.06]">
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.label}
                          disabled={saving}
                          maxLength={256}
                          onChange={(e) => updateRow(row.rowId, { label: e.target.value })}
                          aria-label="Label"
                          placeholder="e.g. Pull-up 850×2000 mm"
                          className={['w-56 rounded-xl border bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:outline-none focus:ring-2', cellBorder].join(' ')}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.width}
                          disabled={saving}
                          onChange={(e) => updateRow(row.rowId, { width: e.target.value })}
                          aria-label="Width"
                          placeholder="850"
                          className={['w-24 rounded-xl border bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:outline-none focus:ring-2', cellBorder].join(' ')}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.height}
                          disabled={saving}
                          onChange={(e) => updateRow(row.rowId, { height: e.target.value })}
                          aria-label="Height"
                          placeholder="2000"
                          className={['w-24 rounded-xl border bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:outline-none focus:ring-2', cellBorder].join(' ')}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={row.unit}
                          disabled={saving}
                          onChange={(e) => updateRow(row.rowId, { unit: e.target.value as BannerDimensionUnit })}
                          aria-label="Unit"
                          className={['w-20 rounded-xl border bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2', cellBorder].join(' ')}
                        >
                          {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative w-32">
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
                            className={['w-full rounded-xl border bg-white py-2 pl-7 pr-3 text-sm text-black placeholder:text-black/30 focus:outline-none focus:ring-2', cellBorder].join(' ')}
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
            Add Size Option
          </button>

          {validation.messages.length > 0 && (
            <ul className="space-y-1 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {validation.messages.map((msg, i) => <li key={i}>{msg}</li>)}
            </ul>
          )}
          {validation.rowErrors.size > 0 && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Each option needs a label, width &gt; 0, height &gt; 0, a unit, and a unit price of at least $0.01 (up to 2 decimals).
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
              Fixed-size options saved.
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
              {saving ? 'Saving…' : 'Save Fixed-Size Options'}
            </button>
            <p className="text-xs text-black/40">
              Saved separately from product fields. Viewers can’t save — the backend enforces the Admin role.
            </p>
          </div>
        </>
      )}
    </section>
  )
}
