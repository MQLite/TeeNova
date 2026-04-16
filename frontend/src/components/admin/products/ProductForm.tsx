'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'

export interface ProductFormValues {
  name: string
  description: string
  basePrice: string
  productType: string
  isActive: boolean
}

interface ProductFormProps {
  initialValues?: Partial<ProductFormValues>
  onSubmit: (values: ProductFormValues) => Promise<void>
  onCancel: () => void
  saving: boolean
}

const FIELD_BASE = [
  'w-full rounded-2xl border border-black/[0.10] bg-white px-4 py-3 text-sm text-black',
  'placeholder:text-black/30',
  'focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/[0.06]',
  'disabled:opacity-50',
].join(' ')

export function ProductForm({ initialValues, onSubmit, onCancel, saving }: ProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>({
    name: initialValues?.name ?? '',
    description: initialValues?.description ?? '',
    basePrice: initialValues?.basePrice ?? '',
    productType: initialValues?.productType ?? 'tshirt',
    isActive: initialValues?.isActive ?? true,
  })
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const price = parseFloat(values.basePrice)
    if (!values.name.trim()) { setError('Name is required.'); return }
    if (isNaN(price) || price <= 0) { setError('Base price must be a positive number.'); return }
    if (!values.productType.trim()) { setError('Product type is required.'); return }

    try {
      await onSubmit(values)
    } catch {
      setError('Failed to save product. Please try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name */}
      <div>
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Classic Cotton Tee"
          maxLength={256}
          disabled={saving}
          className={FIELD_BASE}
          required
        />
      </div>

      {/* Description */}
      <div>
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
          Description
        </label>
        <textarea
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Brief product description visible to customers"
          maxLength={4000}
          rows={4}
          disabled={saving}
          className={`${FIELD_BASE} resize-none leading-relaxed`}
        />
      </div>

      {/* Base Price + Product Type — side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
            Base Price (NZD) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/40">$</span>
            <input
              type="number"
              value={values.basePrice}
              onChange={(e) => set('basePrice', e.target.value)}
              placeholder="0.00"
              min="0.01"
              step="0.01"
              disabled={saving}
              className={`${FIELD_BASE} pl-8`}
              required
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
            Product Type <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={values.productType}
            onChange={(e) => set('productType', e.target.value.toLowerCase())}
            placeholder="tshirt"
            maxLength={64}
            disabled={saving}
            className={FIELD_BASE}
            required
          />
        </div>
      </div>

      {/* Active toggle */}
      <div>
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
          Storefront Visibility
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={values.isActive}
          disabled={saving}
          onClick={() => set('isActive', !values.isActive)}
          className={[
            'inline-flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm transition-colors',
            values.isActive
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-black/[0.08] bg-black/[0.02] text-black/55',
          ].join(' ')}
          style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
        >
          <span className={[
            'h-2 w-2 rounded-full',
            values.isActive ? 'bg-green-500' : 'bg-black/25',
          ].join(' ')} />
          {values.isActive ? 'Active — visible in storefront' : 'Inactive — hidden from storefront'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
           style={{ letterSpacing: '-0.14px' }}>
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 border-t border-black/[0.06] pt-5">
        <Button type="submit" size="sm" loading={saving}>
          Save Product
        </Button>
        <Button type="button" variant="glass" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
