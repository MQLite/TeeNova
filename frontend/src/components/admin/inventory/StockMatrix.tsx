'use client'

import { useMemo, useState } from 'react'
import { makeCatalogApi } from '@/api/catalog'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import { deriveInventoryStatus, INVENTORY_STATUS_STYLE, isValidQtyInput } from '@/lib/inventory'
import { VariantInventoryModal } from '@/components/admin/products/VariantInventoryModal'
import type { ProductVariant } from '@/types'

const catalogApi = makeCatalogApi(adminApiClient)

interface Props {
  productId: string
  variants: ProductVariant[]
}

interface Cell {
  variant: ProductVariant
  qty: string                  // input string; '' = Not Recorded (null)
  savedQty: number | null      // last persisted quantity, for dirty comparison
  threshold: number | null     // edited per-cell (modal) or in bulk; persisted on save
  savedThreshold: number | null // last persisted threshold, for dirty comparison
  note: string | null          // preserved on save; edited via the details modal
}

const cellKey = (size: string, color: string) => `${size.toLowerCase()}|${color.toLowerCase()}`
const MONO = 'font-mono text-[10px] uppercase tracking-[0.54px]'

function buildCells(variants: ProductVariant[]): Record<string, Cell> {
  const cells: Record<string, Cell> = {}
  for (const v of variants) {
    cells[cellKey(v.size, v.color)] = {
      variant: v,
      qty: v.stockQuantity != null ? String(v.stockQuantity) : '',
      savedQty: v.stockQuantity,
      threshold: v.lowStockThreshold,
      savedThreshold: v.lowStockThreshold,
      note: v.inventoryNote,
    }
  }
  return cells
}

/** Pre-fill the bulk threshold input when every variant already shares one value. */
function commonThreshold(variants: ProductVariant[]): string {
  const values = new Set(variants.map((v) => v.lowStockThreshold))
  if (values.size === 1) {
    const only = [...values][0]
    return only != null ? String(only) : ''
  }
  return ''
}

export function StockMatrix({ productId, variants }: Props) {
  const [cells, setCells] = useState<Record<string, Cell>>(() => buildCells(variants))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const [detailsKey, setDetailsKey] = useState<string | null>(null)
  const [bulkThreshold, setBulkThreshold] = useState<string>(() => commonThreshold(variants))

  // Preserve the admin's first-seen order for both axes.
  const sizes  = useMemo(() => [...new Set(variants.map((v) => v.size))], [variants])
  const colors = useMemo(() => [...new Set(variants.map((v) => v.color))], [variants])

  function parseQty(raw: string): number | null {
    const t = raw.trim()
    return t === '' ? null : Number(t)
  }

  function isDirty(c: Cell): boolean {
    if (!isValidQtyInput(c.qty)) return false
    return parseQty(c.qty) !== c.savedQty || c.threshold !== c.savedThreshold
  }

  /** Apply one low-stock threshold to every variant of this product (blank clears it). */
  function applyThresholdToAll() {
    const t = bulkThreshold.trim()
    if (t !== '' && !/^\d+$/.test(t)) {
      setError('Low-stock threshold must be a whole number of 0 or greater, or blank to clear.')
      return
    }
    const value = t === '' ? null : Number(t)
    setCells((prev) => {
      const next: Record<string, Cell> = {}
      for (const k of Object.keys(prev)) next[k] = { ...prev[k], threshold: value }
      return next
    })
    setSavedCount(null)
    setError(null)
  }

  const dirtyKeys = Object.keys(cells).filter((k) => isDirty(cells[k]))
  const invalidKeys = Object.keys(cells).filter((k) => !isValidQtyInput(cells[k].qty))

  function setQty(key: string, value: string) {
    setCells((prev) => ({ ...prev, [key]: { ...prev[key], qty: value } }))
    setSavedCount(null)
    setError(null)
  }

  /** Apply a freshly-saved variant (from cell save or the details modal) back into its cell. */
  function applySaved(updated: ProductVariant) {
    setCells((prev) => ({
      ...prev,
      [cellKey(updated.size, updated.color)]: {
        variant: updated,
        qty: updated.stockQuantity != null ? String(updated.stockQuantity) : '',
        savedQty: updated.stockQuantity,
        threshold: updated.lowStockThreshold,
        savedThreshold: updated.lowStockThreshold,
        note: updated.inventoryNote,
      },
    }))
  }

  async function handleSave() {
    setError(null)
    setSavedCount(null)

    if (invalidKeys.length > 0) {
      setError('Quantities must be a whole number of 0 or greater, or left blank for Not Recorded.')
      return
    }
    if (dirtyKeys.length === 0) return

    setSaving(true)
    try {
      const results = await Promise.allSettled(
        dirtyKeys.map((key) => {
          const c = cells[key]
          const qty = parseQty(c.qty)
          return catalogApi.updateVariantInventory(productId, c.variant.id, {
            inventoryStatus: deriveInventoryStatus(qty, c.threshold),
            stockQuantity: qty,
            lowStockThreshold: c.threshold,
            inventoryNote: c.note,
          })
        }),
      )

      let ok = 0
      let unauthorized = false
      for (const r of results) {
        if (r.status === 'fulfilled') { applySaved(r.value); ok++ }
        else if (r.reason instanceof ApiError && r.reason.status === 401) unauthorized = true
      }

      if (unauthorized) { redirectToLogin('session-expired'); return }

      setSavedCount(ok)
      if (ok < dirtyKeys.length) {
        setError(`${dirtyKeys.length - ok} variant(s) could not be saved. Please retry.`)
      }
    } finally {
      setSaving(false)
    }
  }

  const detailsCell = detailsKey ? cells[detailsKey] : null

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-black/45" style={{ letterSpacing: '-0.14px' }}>
          Enter on-hand quantity per size/colour. Blank = Not Recorded. Status is derived
          automatically; use the gear on a cell to set a low-stock threshold or note.
          Inventory is informational and does not block checkout.
        </p>
        <div className="flex items-center gap-3">
          {savedCount != null && !error && (
            <span className="text-xs text-green-700" style={{ letterSpacing: '-0.14px' }}>
              Saved {savedCount} variant{savedCount !== 1 ? 's' : ''}.
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || dirtyKeys.length === 0}
            className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2 text-sm text-white transition-opacity hover:opacity-85 disabled:opacity-40"
            style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
          >
            {saving && (
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saving ? 'Saving…' : dirtyKeys.length > 0 ? `Save ${dirtyKeys.length} change${dirtyKeys.length !== 1 ? 's' : ''}` : 'Saved'}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" style={{ letterSpacing: '-0.14px' }}>
          {error}
        </p>
      )}

      {/* Product-level low-stock threshold */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-3 py-2">
        <span className={`${MONO} text-black/45`}>Low-stock threshold</span>
        <input
          type="number"
          min="0"
          step="1"
          value={bulkThreshold}
          onChange={(e) => setBulkThreshold(e.target.value)}
          placeholder="none"
          disabled={saving}
          className="w-24 rounded-xl border border-black/[0.10] bg-white px-2.5 py-1.5 text-sm text-black placeholder:text-black/30 focus:border-black/30 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={applyThresholdToAll}
          disabled={saving}
          className="rounded-full border border-black/[0.10] bg-white px-3 py-1.5 text-xs text-black/60 transition-colors hover:border-black/25 hover:text-black disabled:opacity-40"
          style={{ letterSpacing: '-0.14px' }}
        >
          Apply to all variants
        </button>
        <span className="text-xs text-black/35" style={{ letterSpacing: '-0.14px' }}>
          Marks affected cells unsaved — click Save to persist. Blank clears the threshold.
        </span>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto rounded-2xl border border-black/[0.08]">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-black/[0.02]">
              <th className={`${MONO} w-28 border-r border-black/[0.06] px-3 py-2 text-left text-black/40`}>
                Colour \ Size
              </th>
              {sizes.map((size) => (
                <th key={size} className={`${MONO} min-w-[110px] px-2 py-2 text-left text-black/55`}>
                  {size}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {colors.map((color) => (
              <tr key={color} className="border-t border-black/[0.05]">
                <td className="border-r border-black/[0.06] px-3 py-1">
                  <span className={`${MONO} font-medium text-black/70`}>{color}</span>
                </td>
                {sizes.map((size) => {
                  const key = cellKey(size, color)
                  const cell = cells[key]
                  if (!cell) return <td key={size} className="p-1"><div className="min-h-[44px]" /></td>

                  const valid = isValidQtyInput(cell.qty)
                  const status = deriveInventoryStatus(valid ? parseQty(cell.qty) : cell.savedQty, cell.threshold)
                  const style = INVENTORY_STATUS_STYLE[status]

                  return (
                    <td key={size} className="p-1">
                      <div
                        className={[
                          'flex items-center gap-1 rounded-xl border px-1.5 py-1',
                          valid ? 'border-black/[0.10] bg-white' : 'border-red-300 bg-red-50/50',
                        ].join(' ')}
                        title={`${style.label}${cell.threshold != null ? ` · threshold ${cell.threshold}` : ''}${cell.note ? ` · ${cell.note}` : ''}`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          step="1"
                          value={cell.qty}
                          placeholder="—"
                          disabled={saving}
                          onChange={(e) => setQty(key, e.target.value)}
                          className="w-full min-w-0 bg-transparent px-0.5 py-1 text-sm text-black placeholder:text-black/25 focus:outline-none disabled:opacity-50"
                        />
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => setDetailsKey(key)}
                          title="Set low-stock threshold / note"
                          className="shrink-0 rounded-lg p-1 text-black/25 transition-colors hover:bg-black/[0.06] hover:text-black/55 disabled:opacity-40"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3">
        {(['NotRecorded', 'InStock', 'LowStock', 'OutOfStock'] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-xs text-black/45" style={{ letterSpacing: '-0.14px' }}>
            <span className={`h-2 w-2 rounded-full ${INVENTORY_STATUS_STYLE[s].dot}`} />
            {INVENTORY_STATUS_STYLE[s].label}
          </span>
        ))}
      </div>

      {/* Per-cell threshold / note editor (reuses the existing inventory modal) */}
      <VariantInventoryModal
        open={detailsCell !== null}
        onClose={() => setDetailsKey(null)}
        productId={productId}
        variant={detailsCell?.variant ?? null}
        onSaved={(updated) => { applySaved(updated); setDetailsKey(null) }}
      />
    </div>
  )
}
