'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { makeCatalogApi } from '@/api/catalog'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import type { InventoryStatus, ProductVariant } from '@/types'

const catalogApi = makeCatalogApi(adminApiClient)

const NOTE_MAX = 500

const STATUS_OPTIONS: { value: InventoryStatus; label: string }[] = [
  { value: 'NotRecorded', label: 'Not Recorded' },
  { value: 'InStock', label: 'In Stock' },
  { value: 'LowStock', label: 'Low Stock' },
  { value: 'OutOfStock', label: 'Out of Stock' },
]

const FIELD_BASE = [
  'w-full rounded-2xl border border-black/[0.10] bg-white px-4 py-3 text-sm text-black',
  'placeholder:text-black/30',
  'focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/[0.06]',
  'disabled:opacity-50 disabled:bg-black/[0.02]',
].join(' ')

const LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55'

interface FormValues {
  inventoryStatus: InventoryStatus
  stockQuantity: string
  lowStockThreshold: string
  inventoryNote: string
}

function buildValues(variant: ProductVariant): FormValues {
  return {
    inventoryStatus: variant.inventoryStatus,
    stockQuantity: variant.stockQuantity != null ? String(variant.stockQuantity) : '',
    lowStockThreshold: variant.lowStockThreshold != null ? String(variant.lowStockThreshold) : '',
    inventoryNote: variant.inventoryNote ?? '',
  }
}

/** Parse an optional non-negative integer field. Returns { ok, value } where value is null when blank. */
function parseOptionalCount(raw: string): { ok: boolean; value: number | null } {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: true, value: null }
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n < 0) return { ok: false, value: null }
  return { ok: true, value: n }
}

interface Props {
  open: boolean
  onClose: () => void
  productId: string
  variant: ProductVariant | null
  onSaved: (variant: ProductVariant) => void
}

export function VariantInventoryModal({ open, onClose, productId, variant, onSaved }: Props) {
  const [values, setValues] = useState<FormValues>(() =>
    variant ? buildValues(variant) : {
      inventoryStatus: 'NotRecorded', stockQuantity: '', lowStockThreshold: '', inventoryNote: '',
    },
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && variant) {
      setValues(buildValues(variant))
      setError(null)
    }
  }, [open, variant])

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function handleStatusChange(next: InventoryStatus) {
    setValues((prev) => ({
      ...prev,
      inventoryStatus: next,
      // NotRecorded is untracked — the backend stores stockQuantity as null, so clear the field.
      stockQuantity: next === 'NotRecorded' ? '' : prev.stockQuantity,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!variant) return
    setError(null)

    const isNotRecorded = values.inventoryStatus === 'NotRecorded'

    const qty = parseOptionalCount(values.stockQuantity)
    if (!isNotRecorded && !qty.ok) {
      setError('Stock quantity must be a whole number of 0 or greater.')
      return
    }

    const threshold = parseOptionalCount(values.lowStockThreshold)
    if (!threshold.ok) {
      setError('Low stock threshold must be a whole number of 0 or greater.')
      return
    }

    const note = values.inventoryNote.trim()
    if (note.length > NOTE_MAX) {
      setError(`Inventory note cannot exceed ${NOTE_MAX} characters.`)
      return
    }

    setSaving(true)
    try {
      const saved = await catalogApi.updateVariantInventory(productId, variant.id, {
        inventoryStatus: values.inventoryStatus,
        // Backend also forces null for NotRecorded, but we send null explicitly for clarity.
        stockQuantity: isNotRecorded ? null : qty.value,
        lowStockThreshold: threshold.value,
        inventoryNote: note === '' ? null : note,
      })
      onSaved(saved)
    } catch (err) {
      setError(toFriendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  if (!variant) return null

  const isNotRecorded = values.inventoryStatus === 'NotRecorded'
  const variantLabel = `${variant.color} / ${variant.size}`

  return (
    <Modal open={open} onClose={onClose} title="Edit Inventory">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Variant</p>
          <p className="mt-1 text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
            {variantLabel}
            <span className="ml-2 font-mono text-[11px] text-black/40">{variant.sku}</span>
          </p>
        </div>

        {/* Status */}
        <div>
          <label className={LABEL}>Inventory Status</label>
          <select
            value={values.inventoryStatus}
            onChange={(e) => handleStatusChange(e.target.value as InventoryStatus)}
            disabled={saving}
            className={FIELD_BASE}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Quantity + Threshold */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Stock Quantity</label>
            <input
              type="number"
              value={isNotRecorded ? '' : values.stockQuantity}
              onChange={(e) => set('stockQuantity', e.target.value)}
              min="0"
              step="1"
              placeholder={isNotRecorded ? 'Not tracked' : 'Optional'}
              disabled={saving || isNotRecorded}
              className={FIELD_BASE}
            />
            {isNotRecorded && (
              <p className="mt-1 text-xs text-black/40" style={{ letterSpacing: '-0.14px' }}>
                Stored as null while Not Recorded.
              </p>
            )}
          </div>
          <div>
            <label className={LABEL}>Low Stock Threshold</label>
            <input
              type="number"
              value={values.lowStockThreshold}
              onChange={(e) => set('lowStockThreshold', e.target.value)}
              min="0"
              step="1"
              placeholder="Optional"
              disabled={saving}
              className={FIELD_BASE}
            />
          </div>
        </div>

        {/* Note */}
        <div>
          <label className={LABEL}>Inventory Note</label>
          <textarea
            value={values.inventoryNote}
            onChange={(e) => set('inventoryNote', e.target.value)}
            rows={2}
            maxLength={NOTE_MAX}
            placeholder="e.g. Shelf A"
            disabled={saving}
            className={`${FIELD_BASE} resize-none`}
          />
          <p className="mt-1 text-right text-xs text-black/35" style={{ letterSpacing: '-0.14px' }}>
            {values.inventoryNote.length}/{NOTE_MAX}
          </p>
        </div>

        {/* Informational warning */}
        <p
          className="rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 text-xs text-black/55"
          style={{ letterSpacing: '-0.14px' }}
        >
          Inventory is for admin reference only and does not currently block checkout.
        </p>

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
          <Button type="submit" size="sm" loading={saving}>Save Inventory</Button>
          <Button type="button" variant="glass" size="sm" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Maps an API/network error to a clean admin-friendly message; redirects on 401. */
function toFriendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 400:
        return err.message || 'Please check the inventory values and try again.'
      case 401:
        redirectToLogin('session-expired')
        return 'Your session has expired. Redirecting to sign in…'
      case 403:
        return 'You do not have permission to update inventory.'
      case 404:
        return 'This product or variant no longer exists. Refresh and try again.'
      default:
        return err.message || 'Something went wrong while saving inventory. Please try again.'
    }
  }
  return 'Could not reach the server. Please check your connection and try again.'
}
