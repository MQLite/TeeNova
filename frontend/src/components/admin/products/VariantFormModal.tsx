'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { catalogApi } from '@/api/catalog'
import type { ProductVariant } from '@/types'

interface VariantFormValues {
  size: string
  color: string
  sku: string
  isAvailable: boolean
  priceAdjustment: string
  stockQuantity: string
}

interface Props {
  open: boolean
  onClose: () => void
  productId: string
  basePrice: number
  editTarget: ProductVariant | null  // null = create mode
  onSaved: (variant: ProductVariant) => void
}

// Matches the styling pattern used throughout admin forms (ProductForm, etc.)
const FIELD_BASE = [
  'w-full rounded-2xl border border-black/[0.10] bg-white px-4 py-3 text-sm text-black',
  'placeholder:text-black/30',
  'focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/[0.06]',
  'disabled:opacity-50',
].join(' ')

const LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55'

function buildValues(target: ProductVariant | null): VariantFormValues {
  return {
    size:            target?.size            ?? '',
    color:           target?.color           ?? '',
    sku:             target?.sku             ?? '',
    isAvailable:     target?.isAvailable     ?? true,
    priceAdjustment: target != null ? String(target.priceAdjustment) : '0',
    stockQuantity:   target != null ? String(target.stockQuantity)   : '0',
  }
}

// Safely parse a form string value to a number; returns 0 for empty or invalid input.
function safeParse(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

export function VariantFormModal({ open, onClose, productId, basePrice, editTarget, onSaved }: Props) {
  const [values, setValues] = useState<VariantFormValues>(() => buildValues(editTarget))
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  // Reset form whenever the modal opens or the edit target changes
  useEffect(() => {
    if (open) {
      setValues(buildValues(editTarget))
      setError(null)
    }
  }, [open, editTarget])

  function set<K extends keyof VariantFormValues>(key: K, value: VariantFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!values.size.trim())  { setError('Size is required.');  return }
    if (!values.color.trim()) { setError('Color is required.'); return }
    if (!values.sku.trim())   { setError('SKU is required.');   return }

    const priceAdj = parseFloat(values.priceAdjustment)
    const stockQty = parseInt(values.stockQuantity, 10)

    if (isNaN(priceAdj))               { setError('Price adjustment must be a number.'); return }
    if (isNaN(stockQty) || stockQty < 0) { setError('Stock quantity must be 0 or greater.'); return }

    setSaving(true)
    try {
      const payload = {
        size:            values.size.trim(),
        color:           values.color.trim(),
        sku:             values.sku.trim(),
        isAvailable:     values.isAvailable,
        priceAdjustment: priceAdj,
        stockQuantity:   stockQty,
      }

      const saved = editTarget
        ? await catalogApi.updateVariant(productId, editTarget.id, payload)
        : await catalogApi.createVariant(productId, payload)

      onSaved(saved)
    } catch (err) {
      const msg = err instanceof Error ? err.message : null
      setError(msg ?? 'Could not save variant. Please check your inputs and try again.')
    } finally {
      setSaving(false)
    }
  }

  const isEdit = editTarget !== null

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Variant' : 'Add Variant'}>
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Size + Color — primary identity fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>
              Size <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={values.size}
              onChange={(e) => set('size', e.target.value)}
              placeholder="e.g. S, M, L, XL"
              maxLength={32}
              disabled={saving}
              className={FIELD_BASE}
            />
          </div>
          <div>
            <label className={LABEL}>
              Color <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={values.color}
              onChange={(e) => set('color', e.target.value)}
              placeholder="e.g. Black, Navy"
              maxLength={64}
              disabled={saving}
              className={FIELD_BASE}
            />
          </div>
        </div>

        {/* SKU */}
        <div>
          <label className={LABEL}>
            SKU <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={values.sku}
            onChange={(e) => set('sku', e.target.value)}
            placeholder="e.g. PROD-M-BLK"
            maxLength={64}
            disabled={saving}
            className={FIELD_BASE}
          />
        </div>

        {/* Availability toggle */}
        <div>
          <label className={LABEL}>Availability</label>
          <button
            type="button"
            role="switch"
            aria-checked={values.isAvailable}
            disabled={saving}
            onClick={() => set('isAvailable', !values.isAvailable)}
            className={[
              'inline-flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm transition-colors',
              values.isAvailable
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-black/[0.08] bg-black/[0.02] text-black/55',
            ].join(' ')}
            style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
          >
            <span className={[
              'h-2 w-2 rounded-full',
              values.isAvailable ? 'bg-green-500' : 'bg-black/25',
            ].join(' ')} />
            {values.isAvailable ? 'Available for purchase' : 'Unavailable'}
          </button>
        </div>

        {/* Price adjustment + Stock — secondary fields, kept together */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Price Adjustment</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/40">
                $
              </span>
              <input
                type="number"
                value={values.priceAdjustment}
                onChange={(e) => set('priceAdjustment', e.target.value)}
                step="0.01"
                disabled={saving}
                className={`${FIELD_BASE} pl-8`}
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>Stock Quantity</label>
            <input
              type="number"
              value={values.stockQuantity}
              onChange={(e) => set('stockQuantity', e.target.value)}
              min="0"
              step="1"
              disabled={saving}
              className={FIELD_BASE}
            />
          </div>
        </div>

        {/* Pricing preview — live calculation */}
        {(() => {
          const adj        = safeParse(values.priceAdjustment)
          const finalPrice = basePrice + adj
          const adjSign    = adj >= 0 ? '+' : '−'
          return (
            <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Base Price</span>
                <span className="text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
                  ${basePrice.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Adjustment</span>
                <span className="text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
                  {adjSign} ${Math.abs(adj).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-black/[0.06] pt-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">Final Price</span>
                <span className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.14px' }}>
                  ${finalPrice.toFixed(2)}
                </span>
              </div>
            </div>
          )
        })()}

        {/* Error banner */}
        {error && (
          <p
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            style={{ letterSpacing: '-0.14px' }}
          >
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 border-t border-black/[0.06] pt-4">
          <Button type="submit" size="sm" loading={saving}>
            {isEdit ? 'Save Changes' : 'Add Variant'}
          </Button>
          <Button
            type="button"
            variant="glass"
            size="sm"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>

      </form>
    </Modal>
  )
}
