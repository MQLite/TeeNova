'use client'

import { useMemo, useState } from 'react'
import { makeCatalogApi } from '@/api/catalog'
import { adminApiClient } from '@/lib/admin-client'
import type { ProductPriceTier, ProductVariant } from '@/types'

const catalogApi = makeCatalogApi(adminApiClient)

interface Props {
  productId: string
  initialTiers: ProductPriceTier[]
  variants: ProductVariant[]
}

// Sentinel for the product-level (null variant) scope, used as a stable select value & map key.
const PRODUCT_SCOPE = '__product__'

interface TierRow {
  key: string
  scope: string // PRODUCT_SCOPE or a variant id
  minQuantity: string
  unitPrice: string
}

interface RowError {
  minQuantity?: string
  unitPrice?: string
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
    : `tier-${Math.random().toString(36).slice(2)}`
}

function scopeOf(tier: ProductPriceTier): string {
  return tier.productVariantId ?? PRODUCT_SCOPE
}

function tiersToRows(tiers: ProductPriceTier[]): TierRow[] {
  return [...tiers]
    .sort(
      (a, b) =>
        scopeOf(a).localeCompare(scopeOf(b)) || a.minQuantity - b.minQuantity,
    )
    .map((t) => ({
      key: newKey(),
      scope: scopeOf(t),
      minQuantity: String(t.minQuantity),
      unitPrice: t.unitPrice.toFixed(2),
    }))
}

export function PriceTierSection({ productId, initialTiers, variants }: Props) {
  const [rows, setRows] = useState<TierRow[]>(() => tiersToRows(initialTiers))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Scope options: product default + every variant (so a single-writer override is possible).
  const scopeOptions = useMemo(
    () => [
      { value: PRODUCT_SCOPE, label: 'Product default' },
      ...variants.map((v) => ({ value: v.id, label: `${v.color} / ${v.size}` })),
    ],
    [variants],
  )

  function scopeLabel(scope: string): string {
    return scopeOptions.find((o) => o.value === scope)?.label ?? 'Unknown variant'
  }

  // ── Validation (mirrors backend rules) ───────────────────────────────────────
  const { rowErrors, scopeErrors, warnings, hasErrors } = useMemo(() => {
    const rowErrors: Record<string, RowError> = {}
    const scopeErrors: string[] = []
    const warnings: string[] = []

    for (const row of rows) {
      const err: RowError = {}

      const minTrim = row.minQuantity.trim()
      if (minTrim === '') err.minQuantity = 'Required.'
      else if (!/^\d+$/.test(minTrim)) err.minQuantity = 'Whole number.'
      else if (parseInt(minTrim, 10) < 1) err.minQuantity = 'Must be ≥ 1.'

      const priceTrim = row.unitPrice.trim()
      if (priceTrim === '') err.unitPrice = 'Required.'
      else if (!UNIT_PRICE_PATTERN.test(priceTrim)) err.unitPrice = 'Max 2 decimals.'
      else if (parseFloat(priceTrim) <= 0) err.unitPrice = 'Must be > 0.'

      if (err.minQuantity || err.unitPrice) rowErrors[row.key] = err
    }

    // Per-scope checks: no duplicate MinQuantity, and a MinQuantity = 1 row is required.
    const byScope = new Map<string, TierRow[]>()
    for (const row of rows) {
      if (!byScope.has(row.scope)) byScope.set(row.scope, [])
      byScope.get(row.scope)!.push(row)
    }

    for (const [scope, scopeRows] of byScope) {
      const validMins = scopeRows
        .filter((r) => /^\d+$/.test(r.minQuantity.trim()))
        .map((r) => parseInt(r.minQuantity, 10))

      const seen = new Set<number>()
      for (const m of validMins) {
        if (seen.has(m)) {
          scopeErrors.push(`${scopeLabel(scope)}: duplicate minimum quantity ${m}.`)
          break
        }
        seen.add(m)
      }

      if (validMins.length > 0 && !validMins.includes(1))
        scopeErrors.push(`${scopeLabel(scope)}: add a tier starting at quantity 1.`)

      // Soft, non-blocking warning: prices should normally fall as quantity rises.
      const priced = scopeRows
        .filter(
          (r) => /^\d+$/.test(r.minQuantity.trim()) && UNIT_PRICE_PATTERN.test(r.unitPrice.trim()),
        )
        .map((r) => ({ min: parseInt(r.minQuantity, 10), price: parseFloat(r.unitPrice) }))
        .sort((a, b) => a.min - b.min)
      for (let i = 1; i < priced.length; i++) {
        if (priced[i].price >= priced[i - 1].price) {
          warnings.push(
            `${scopeLabel(scope)}: price at ${priced[i].min}+ is not lower than the smaller break.`,
          )
          break
        }
      }
    }

    const hasErrors = Object.keys(rowErrors).length > 0 || scopeErrors.length > 0
    return { rowErrors, scopeErrors, warnings, hasErrors }
  }, [rows, scopeOptions]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Row mutations ────────────────────────────────────────────────────────────
  function addRow() {
    setSaveSuccess(false)
    setRows((prev) => [
      ...prev,
      { key: newKey(), scope: PRODUCT_SCOPE, minQuantity: '', unitPrice: '' },
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
    setSaveError(null)
    setSaveSuccess(false)
    if (hasErrors) {
      setSaveError('Fix the highlighted issues before saving.')
      return
    }

    const payloadTiers = rows.map((r) => ({
      productVariantId: r.scope === PRODUCT_SCOPE ? null : r.scope,
      minQuantity: parseInt(r.minQuantity, 10),
      unitPrice: parseFloat(r.unitPrice),
    }))

    setSaving(true)
    try {
      const updated = await catalogApi.setProductPriceTiers(productId, { tiers: payloadTiers })
      setRows(tiersToRows(updated.priceTiers))
      setSaveSuccess(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : null
      setSaveError(msg ?? 'Could not save price tiers. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
      <div className="mb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Pricing</p>
        <h2 className="mt-1 text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
          Price Tiers
        </h2>
        <div className="mt-3 space-y-1.5 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 text-sm leading-6 text-black/60">
          <p>
            Tier prices are for the <strong className="text-black/75">standard one-side printed product</strong>,
            including the garment and one standard print — not the blank garment price.
          </p>
          <p>Extra print options can still add to the customer’s final price.</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
            Example: 1 pc $35, 2+ $30 ea, 10+ $25 ea
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/[0.12] px-4 py-6 text-center text-sm text-black/55">
          No tiered pricing configured. This product currently uses the legacy additive price formula.
        </div>
      ) : (
        <div className="space-y-2">
          {/* Column headers */}
          <div className="hidden grid-cols-[1.4fr_0.9fr_1fr_auto] gap-3 px-1 sm:grid">
            <span className={LABEL + ' mb-0'}>Scope</span>
            <span className={LABEL + ' mb-0'}>Min quantity</span>
            <span className={LABEL + ' mb-0'}>Unit price (NZD)</span>
            <span className="w-8" />
          </div>

          {rows.map((row) => {
            const err = rowErrors[row.key]
            return (
              <div
                key={row.key}
                className="grid grid-cols-1 gap-3 rounded-2xl border border-black/[0.06] bg-black/[0.01] p-3 sm:grid-cols-[1.4fr_0.9fr_1fr_auto] sm:items-start sm:border-0 sm:bg-transparent sm:p-1"
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
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Min quantity */}
                <div>
                  <span className={LABEL + ' sm:hidden'}>Min quantity</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={row.minQuantity}
                    disabled={saving}
                    placeholder="1"
                    onChange={(e) => updateRow(row.key, { minQuantity: e.target.value })}
                    className={FIELD_BASE + (err?.minQuantity ? ' border-red-300' : '')}
                  />
                  {err?.minQuantity && (
                    <p className="mt-1 text-xs text-red-600" style={{ letterSpacing: '-0.14px' }}>
                      {err.minQuantity}
                    </p>
                  )}
                </div>

                {/* Unit price */}
                <div>
                  <span className={LABEL + ' sm:hidden'}>Unit price (NZD)</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-black/40">
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.unitPrice}
                      disabled={saving}
                      placeholder="0.00"
                      onChange={(e) => updateRow(row.key, { unitPrice: e.target.value })}
                      className={FIELD_BASE + ' pl-7' + (err?.unitPrice ? ' border-red-300' : '')}
                    />
                  </div>
                  {err?.unitPrice && (
                    <p className="mt-1 text-xs text-red-600" style={{ letterSpacing: '-0.14px' }}>
                      {err.unitPrice}
                    </p>
                  )}
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

      {/* Add row */}
      <div className="mt-4">
        <button
          type="button"
          onClick={addRow}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full border border-black/[0.12] bg-white px-4 py-2 text-sm text-black/70 transition-colors hover:border-black/30 hover:text-black disabled:opacity-40"
          style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add tier
        </button>
      </div>

      {/* Scope-level validation */}
      {scopeErrors.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {scopeErrors.map((e, i) => (
            <li key={i} style={{ letterSpacing: '-0.14px' }}>
              {e}
            </li>
          ))}
        </ul>
      )}

      {/* Non-blocking warnings */}
      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {warnings.map((w, i) => (
            <li key={i} style={{ letterSpacing: '-0.14px' }}>
              {w}
            </li>
          ))}
        </ul>
      )}

      {/* Save feedback */}
      {saveError && (
        <p
          className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          style={{ letterSpacing: '-0.14px' }}
        >
          {saveError}
        </p>
      )}
      {saveSuccess && !saveError && (
        <p
          className="mt-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          style={{ letterSpacing: '-0.14px' }}
        >
          {rows.length === 0
            ? 'Price tiers cleared — this product now uses additive pricing.'
            : 'Price tiers saved.'}
        </p>
      )}

      {/* Save */}
      <div className="mt-4 flex items-center gap-3 border-t border-black/[0.06] pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || hasErrors}
          className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm text-white transition-opacity hover:opacity-85 disabled:opacity-40"
          style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
        >
          {saving && (
            <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {saving ? 'Saving…' : 'Save Price Tiers'}
        </button>
        <p className="text-xs text-black/40" style={{ letterSpacing: '-0.14px' }}>
          Saved separately from the product form, variants, and inventory.
        </p>
      </div>
    </section>
  )
}
