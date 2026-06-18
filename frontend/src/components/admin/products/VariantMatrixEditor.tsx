'use client'

import { useState } from 'react'
import { makeCatalogApi } from '@/api/catalog'
import { adminApiClient } from '@/lib/admin-client'

const catalogApi = makeCatalogApi(adminApiClient)
import type { MatrixCell, ProductVariant } from '@/types'
import { BulkSizeColorInput } from './BulkSizeColorInput'
import { VariantMatrixTable } from './VariantMatrixTable'

interface Props {
  productId: string
  variants: ProductVariant[]
  onSaved: (updated: ProductVariant[]) => void
  onColorsChange?: (colors: string[]) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse comma/newline-separated input, trim, drop blanks, deduplicate case-insensitively (preserve first casing). */
function parseEntries(raw: string): string[] {
  const seen = new Set<string>()
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((entry) => {
      const lower = entry.toLowerCase()
      if (seen.has(lower)) return false
      seen.add(lower)
      return true
    })
}

/** Internal cell-map key. Lowercase-normalised so lookups are case-insensitive. */
function cellKey(size: string, color: string): string {
  return `${size.toLowerCase()}|${color.toLowerCase()}`
}

/** Auto-generate a SKU for a new variant: PREFIX-SIZE-COLOR, max 64 chars. */
function generateSku(prefix: string, size: string, color: string): string {
  const norm = (s: string) =>
    s.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_-]/g, '')
  return `${norm(prefix)}-${norm(size)}-${norm(color)}`.slice(0, 64)
}

/** Build the cell map for a given sizes × colors combination against existing variants. */
function buildCells(
  parsedSizes: string[],
  parsedColors: string[],
  existing: ProductVariant[],
): Record<string, MatrixCell> {
  const lookup = new Map<string, ProductVariant>()
  for (const v of existing) lookup.set(cellKey(v.size, v.color), v)

  const cells: Record<string, MatrixCell> = {}
  for (const size of parsedSizes) {
    for (const color of parsedColors) {
      const key = cellKey(size, color)
      const v   = lookup.get(key)
      cells[key] = v
        ? { variantId: v.id, size: v.size, color: v.color, priceAdjustment: v.priceAdjustment,
            isAvailable: v.isAvailable, sku: v.sku, stockQuantity: v.stockQuantity, isDirty: false }
        : { size, color, priceAdjustment: 0, isAvailable: true, stockQuantity: 0, isDirty: false }
    }
  }
  return cells
}

// ── Style constants matching the rest of the admin UI ─────────────────────────

const FIELD_BASE = [
  'w-full rounded-2xl border border-black/[0.10] bg-white px-4 py-3 text-sm text-black',
  'placeholder:text-black/30',
  'focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/[0.06]',
  'disabled:opacity-50',
].join(' ')

const LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55'

// ── Component ─────────────────────────────────────────────────────────────────

export function VariantMatrixEditor({ productId, variants, onSaved, onColorsChange }: Props) {
  // Derive initial sizes/colors from existing variants so the matrix is visible immediately
  const initSizes  = [...new Set(variants.map((v) => v.size))]
  const initColors = [...new Set(variants.map((v) => v.color))]

  const [sizesInput,    setSizesInput]    = useState(initSizes.join(', '))
  const [colorsInput,   setColorsInput]   = useState(initColors.join(', '))
  const [skuPrefix,     setSkuPrefix]     = useState('')
  const [sizes,         setSizes]         = useState<string[]>(initSizes)
  const [colors,        setColors]        = useState<string[]>(initColors)
  const [cells,         setCells]         = useState<Record<string, MatrixCell>>(
    () => buildCells(initSizes, initColors, variants),
  )
  const [generated,     setGenerated]     = useState(variants.length > 0)
  const [saving,        setSaving]        = useState(false)
  const [saveError,     setSaveError]     = useState<string | null>(null)
  const [saveSuccess,   setSaveSuccess]   = useState(false)
  const [applyAllInput, setApplyAllInput] = useState('')
  const [inputErrors,   setInputErrors]   = useState<{
    sizes?: string
    colors?: string
    skuPrefix?: string
  }>({})

  // ── Matrix generation ───────────────────────────────────────────────────────

  function handleGenerateMatrix() {
    const parsedSizes  = parseEntries(sizesInput)
    const parsedColors = parseEntries(colorsInput)
    const errors: typeof inputErrors = {}

    if (parsedSizes.length === 0)  errors.sizes  = 'Enter at least one size.'
    if (parsedColors.length === 0) errors.colors = 'Enter at least one color.'

    const longSize  = parsedSizes.find((s) => s.length > 32)
    const longColor = parsedColors.find((c) => c.length > 64)
    if (longSize)  errors.sizes  = `"${longSize}" exceeds the 32-character limit.`
    if (longColor) errors.colors = `"${longColor}" exceeds the 64-character limit.`

    if (Object.keys(errors).length > 0) {
      setInputErrors(errors)
      return
    }
    setInputErrors({})

    setSizes(parsedSizes)
    setColors(parsedColors)
    onColorsChange?.(parsedColors)
    setCells(buildCells(parsedSizes, parsedColors, variants))
    setGenerated(true)
    setSaveError(null)
    setSaveSuccess(false)
  }

  // ── Cell mutations ──────────────────────────────────────────────────────────

  function updateCell(key: string, updates: Partial<MatrixCell>) {
    setCells((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...updates, isDirty: true },
    }))
  }

  // ── Bulk actions ────────────────────────────────────────────────────────────

  function markAllAvailable() {
    setCells((prev) => {
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        next[k] = { ...next[k], isAvailable: true, isDirty: true }
      }
      return next
    })
  }

  function markAllUnavailable() {
    setCells((prev) => {
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        next[k] = { ...next[k], isAvailable: false, priceAdjustment: 0, isDirty: true }
      }
      return next
    })
  }

  function handleApplyPriceToAll() {
    const n = parseFloat(applyAllInput)
    if (isNaN(n)) return
    setCells((prev) => {
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        if (next[k].isAvailable) {
          next[k] = { ...next[k], priceAdjustment: n, isDirty: true }
        }
      }
      return next
    })
    setApplyAllInput('')
  }

  // Rows = colors, so "mark row unavailable" iterates over sizes for a given color
  function markRowUnavailable(color: string) {
    setCells((prev) => {
      const next = { ...prev }
      for (const size of sizes) {
        const k = cellKey(size, color)
        if (next[k]) next[k] = { ...next[k], isAvailable: false, priceAdjustment: 0, isDirty: true }
      }
      return next
    })
  }

  // Columns = sizes, so "mark col unavailable" iterates over colors for a given size
  function markColUnavailable(size: string) {
    setCells((prev) => {
      const next = { ...prev }
      for (const color of colors) {
        const k = cellKey(size, color)
        if (next[k]) next[k] = { ...next[k], isAvailable: false, priceAdjustment: 0, isDirty: true }
      }
      return next
    })
  }

  function setRowPrice(color: string, price: number) {
    setCells((prev) => {
      const next = { ...prev }
      for (const size of sizes) {
        const k = cellKey(size, color)
        if (next[k]) next[k] = { ...next[k], priceAdjustment: price, isDirty: true }
      }
      return next
    })
  }

  function setColPrice(size: string, price: number) {
    setCells((prev) => {
      const next = { ...prev }
      for (const color of colors) {
        const k = cellKey(size, color)
        if (next[k]) next[k] = { ...next[k], priceAdjustment: price, isDirty: true }
      }
      return next
    })
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaveError(null)
    setSaveSuccess(false)

    const cellList = Object.values(cells)

    // Block if any available cell has an invalid price
    const invalidCell = cellList.find(
      (c) => c.isAvailable && c.priceAdjustment === '',
    )
    if (invalidCell) {
      setSaveError(
        `Price adjustment for ${invalidCell.size} / ${invalidCell.color} is not a valid number.`,
      )
      return
    }

    // SKU prefix required when there are new variants
    const hasNewVariants = cellList.some((c) => !c.variantId)
    if (hasNewVariants && !skuPrefix.trim()) {
      setInputErrors((prev) => ({
        ...prev,
        skuPrefix: 'SKU prefix is required to create new variants.',
      }))
      return
    }
    setInputErrors((prev) => ({ ...prev, skuPrefix: undefined }))

    const variantItems = cellList.map((cell) => ({
      id:              cell.variantId,
      sku:             cell.variantId
                         ? (cell.sku ?? '')
                         : generateSku(skuPrefix, cell.size, cell.color),
      size:            cell.size,
      color:           cell.color,
      priceAdjustment: cell.isAvailable ? (cell.priceAdjustment as number) : 0,
      stockQuantity:   cell.stockQuantity,
      isAvailable:     cell.isAvailable,
    }))

    setSaving(true)
    try {
      const updated = await catalogApi.bulkSaveVariants(productId, { variants: variantItems })
      onSaved(updated)
      setSaveSuccess(true)

      // Re-index cells with the returned IDs and SKUs so the next save is an update, not a create
      const lookup = new Map<string, ProductVariant>()
      for (const v of updated) {
        lookup.set(cellKey(v.size, v.color), v)
      }
      setCells((prev) => {
        const next = { ...prev }
        for (const k of Object.keys(next)) {
          const v = lookup.get(k)
          if (v) {
            next[k] = { ...next[k], variantId: v.id, sku: v.sku, isDirty: false }
          }
        }
        return next
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : null
      setSaveError(msg ?? 'Could not save variants. Please check your inputs and try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const hasNewVariants = generated && Object.values(cells).some((c) => !c.variantId)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Sizes + Colors bulk input */}
      <div className="grid grid-cols-2 gap-4">
        <BulkSizeColorInput
          label="Sizes"
          placeholder={"S, M, L, XL\nor one per line"}
          value={sizesInput}
          onChange={setSizesInput}
          error={inputErrors.sizes}
          disabled={saving}
        />
        <BulkSizeColorInput
          label="Colors"
          placeholder={"Black, White, Red\nor one per line"}
          value={colorsInput}
          onChange={setColorsInput}
          error={inputErrors.colors}
          disabled={saving}
        />
      </div>

      {/* SKU Prefix + Generate Matrix */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[180px] max-w-xs flex-1">
          <label className={LABEL}>SKU Prefix</label>
          <input
            type="text"
            value={skuPrefix}
            onChange={(e) => setSkuPrefix(e.target.value)}
            placeholder="e.g. PROD-001"
            maxLength={30}
            disabled={saving}
            className={FIELD_BASE + (inputErrors.skuPrefix ? ' border-red-300' : '')}
          />
          {inputErrors.skuPrefix ? (
            <p className="mt-1 text-xs text-red-600" style={{ letterSpacing: '-0.14px' }}>
              {inputErrors.skuPrefix}
            </p>
          ) : (
            <p className="mt-1 text-xs text-black/35" style={{ letterSpacing: '-0.14px' }}>
              {hasNewVariants
                ? 'Required — used for new variant SKUs: PREFIX-SIZE-COLOR'
                : 'Used for new variant SKUs: PREFIX-SIZE-COLOR'}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleGenerateMatrix}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm text-white transition-opacity hover:opacity-85 disabled:opacity-40"
          style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
        >
          Generate Matrix
        </button>
      </div>

      {/* Matrix section — only shown after Generate */}
      {generated && sizes.length > 0 && colors.length > 0 && (
        <>
          {/* Bulk actions toolbar */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/35">
              Bulk:
            </span>

            <button
              type="button"
              disabled={saving}
              onClick={markAllAvailable}
              className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs text-green-800 transition-colors hover:bg-green-100 disabled:opacity-40"
              style={{ letterSpacing: '-0.14px' }}
            >
              Mark all available
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={markAllUnavailable}
              className="rounded-full border border-black/[0.08] bg-white px-3 py-1 text-xs text-black/55 transition-colors hover:border-black/20 hover:text-black disabled:opacity-40"
              style={{ letterSpacing: '-0.14px' }}
            >
              Mark all N/A
            </button>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-black/35" style={{ letterSpacing: '-0.14px' }}>
                Apply $
              </span>
              <input
                type="number"
                value={applyAllInput}
                onChange={(e) => setApplyAllInput(e.target.value)}
                step="0.01"
                placeholder="0.00"
                disabled={saving}
                className="w-20 rounded-xl border border-black/[0.10] bg-white px-2 py-1 text-xs text-black focus:border-black/30 focus:outline-none disabled:opacity-50"
              />
              <span className="text-xs text-black/35" style={{ letterSpacing: '-0.14px' }}>
                to all
              </span>
              <button
                type="button"
                disabled={saving || applyAllInput === ''}
                onClick={handleApplyPriceToAll}
                className="rounded-xl border border-black/[0.10] bg-white px-2 py-1 text-xs text-black/55 transition-colors hover:border-black/20 hover:text-black disabled:opacity-40"
                style={{ letterSpacing: '-0.14px' }}
              >
                Apply
              </button>
            </div>
          </div>

          {/* The matrix grid */}
          <VariantMatrixTable
            sizes={sizes}
            colors={colors}
            cells={cells}
            disabled={saving}
            onCellChange={updateCell}
            onMarkRowUnavailable={markRowUnavailable}
            onMarkColUnavailable={markColUnavailable}
            onSetRowPrice={setRowPrice}
            onSetColPrice={setColPrice}
          />

          {/* Save error */}
          {saveError && (
            <p
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              style={{ letterSpacing: '-0.14px' }}
            >
              {saveError}
            </p>
          )}

          {/* Save success */}
          {saveSuccess && !saveError && (
            <p
              className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
              style={{ letterSpacing: '-0.14px' }}
            >
              Matrix saved — variants updated successfully.
            </p>
          )}

          {/* Save button */}
          <div className="flex items-center gap-3 border-t border-black/[0.06] pt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm text-white transition-opacity hover:opacity-85 disabled:opacity-40"
              style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
            >
              {saving && (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              )}
              {saving ? 'Saving…' : 'Save Matrix'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
