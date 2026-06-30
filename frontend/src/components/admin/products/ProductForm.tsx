'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { PrintPricingGroupField } from './PrintPricingGroupField'
import type { PricingModel, ProductKind } from '@/types'

export interface ProductFormValues {
  name: string
  description: string
  basePrice: string
  productType: string
  isActive: boolean
  /** Print-pricing group id, or '' for ungrouped (Jira 9203). */
  printPricingGroupId: string
  // ── Product kind / pricing model (Jira 9503/9504) ───────────────────────────
  kind: ProductKind
  pricingModel: PricingModel
  /** Minimum sellable quantity as a string (form input). Parsed to int ≥ 1 on submit. */
  minimumQuantity: string
  designUploadRequired: boolean
}

// Product kinds offered in the admin. Banner/Other have no storefront pricing yet (placeholder).
const KIND_OPTIONS: { value: ProductKind; label: string; hint: string }[] = [
  { value: 'Garment', label: 'Garment',  hint: 'Color/size variants + print placements (the existing model).' },
  { value: 'Badge',   label: 'Badge',    hint: 'Quantity-tier unit pricing, item-level design, no variants/prints.' },
  { value: 'Banner',  label: 'Banner',   hint: 'Quote-only: customers submit dimensions/material/finishing + design as a quote request. No online price/payment is taken.' },
  { value: 'Other',   label: 'Other',    hint: 'Any other category. Manual quote only for now.' },
]

// Each kind selects its pricing model automatically (Jira 9504). The backend is authoritative; this is
// purely UX so admins don't pair an unsupported model. Banner/Other map to CustomQuoteOnly (no auto price).
const PRICING_MODEL_FOR_KIND: Record<ProductKind, PricingModel> = {
  Garment: 'GarmentPrint',
  Badge:   'QuantityTierUnit',
  Banner:  'CustomQuoteOnly',
  Other:   'CustomQuoteOnly',
}

const PRICING_MODEL_LABEL: Record<PricingModel, string> = {
  GarmentPrint:     'Garment + Print',
  QuantityTierUnit: 'Quantity-Tier Unit',
  FixedSize:        'Fixed Size',
  AreaBased:        'Area Based',
  CustomQuoteOnly:  'Custom Quote Only',
}

interface ProductFormProps {
  initialValues?: Partial<ProductFormValues>
  onSubmit: (values: ProductFormValues) => Promise<void>
  onCancel: () => void
  saving: boolean
  showPrintPricingGroup?: boolean
}

// Known product types offered as preset options in the select.
// Any value not in this list is treated as a custom "other" entry.
const PRESET_TYPES = ['tshirt', 'hoodie', 'cap', 'bag'] as const

const PRESET_LABELS: Record<(typeof PRESET_TYPES)[number], string> = {
  tshirt: 'T-Shirt',
  hoodie: 'Hoodie',
  cap:    'Cap',
  bag:    'Bag',
}

function isPreset(type: string): type is (typeof PRESET_TYPES)[number] {
  return (PRESET_TYPES as readonly string[]).includes(type)
}

// Shared input styling — matches the rest of the admin forms
const FIELD_BASE = [
  'w-full rounded-2xl border border-black/[0.10] bg-white px-4 py-3 text-sm text-black',
  'placeholder:text-black/30',
  'focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/[0.06]',
  'disabled:opacity-50',
].join(' ')

const LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.54px] text-black/35">
        {children}
      </span>
      <div className="h-px flex-1 bg-black/[0.06]" />
    </div>
  )
}

export function ProductForm({
  initialValues,
  onSubmit,
  onCancel,
  saving,
  showPrintPricingGroup = true,
}: ProductFormProps) {
  // Resolve prop defaults once — used both as form seed and dirty baseline
  const resolvedKind: ProductKind = initialValues?.kind ?? 'Garment'
  const resolved: ProductFormValues = {
    name:        initialValues?.name        ?? '',
    description: initialValues?.description ?? '',
    basePrice:   initialValues?.basePrice   ?? '',
    productType: initialValues?.productType ?? 'tshirt',
    isActive:    initialValues?.isActive    ?? true,
    printPricingGroupId: initialValues?.printPricingGroupId ?? '',
    kind:        resolvedKind,
    // Trust an explicit incoming model; otherwise derive from kind so the pairing stays valid.
    pricingModel: initialValues?.pricingModel ?? PRICING_MODEL_FOR_KIND[resolvedKind],
    minimumQuantity: initialValues?.minimumQuantity ?? '1',
    designUploadRequired: initialValues?.designUploadRequired ?? false,
  }

  const [values,     setValues]     = useState<ProductFormValues>(resolved)
  const [typeMode,   setTypeMode]   = useState<'preset' | 'other'>(
    isPreset(resolved.productType) ? 'preset' : 'other'
  )
  const [customType, setCustomType] = useState(
    isPreset(resolved.productType) ? '' : resolved.productType
  )
  const [error, setError] = useState<string | null>(null)

  // Capture the resolved initial values once; used for dirty detection across renders.
  const initialRef = useRef<ProductFormValues>(resolved)

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  // ── ProductType select/other logic ────────────────────────────────────────

  function handleTypeSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (val === 'other') {
      setTypeMode('other')
      // Keep whatever was in the custom field, or clear to let the user type
      set('productType', customType)
    } else {
      setTypeMode('preset')
      set('productType', val)
    }
  }

  function handleCustomType(e: React.ChangeEvent<HTMLInputElement>) {
    // Enforce lowercase letters, digits, and hyphens to prevent casing inconsistencies
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setCustomType(val)
    set('productType', val)
  }

  // ── Product kind ──────────────────────────────────────────────────────────
  // Changing kind auto-selects the matching pricing model so the pairing is always valid (Jira 9504).
  function handleKindChange(kind: ProductKind) {
    setValues((prev) => ({ ...prev, kind, pricingModel: PRICING_MODEL_FOR_KIND[kind] }))
  }

  const isBadge = values.kind === 'Badge'

  // ── Dirty detection ───────────────────────────────────────────────────────

  const init = initialRef.current
  const isDirty =
    values.name        !== init.name        ||
    values.description !== init.description ||
    values.basePrice   !== init.basePrice   ||
    values.productType !== init.productType ||
    values.isActive    !== init.isActive    ||
    values.printPricingGroupId !== init.printPricingGroupId ||
    values.kind                !== init.kind ||
    values.pricingModel        !== init.pricingModel ||
    values.minimumQuantity     !== init.minimumQuantity ||
    values.designUploadRequired !== init.designUploadRequired

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const price = parseFloat(values.basePrice)
    if (!values.name.trim()) {
      setError('Name is required.')
      return
    }
    if (isNaN(price) || price < 0) {
      setError('Base price cannot be negative.')
      return
    }
    if (!values.productType.trim()) {
      setError('Product type is required.')
      return
    }
    const minQty = parseInt(values.minimumQuantity, 10)
    if (isNaN(minQty) || minQty < 1) {
      setError('Minimum quantity must be a whole number of at least 1.')
      return
    }

    try {
      await onSubmit(values)
    } catch (err) {
      // Surface the server message when available; fall back to generic copy
      const serverMsg = err instanceof Error ? err.message : null
      setError(serverMsg ?? 'Could not save product. Please check your inputs and try again.')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-7">

      {/* ── Section 1: Basic Information ──────────────────────────────────── */}
      <div className="space-y-4">
        <SectionLabel>Basic Information</SectionLabel>

        {/* Name */}
        <div>
          <label className={LABEL}>
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
          />
        </div>

        {/* Description */}
        <div>
          <label className={LABEL}>Description</label>
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
      </div>

      {/* ── Section 2: Pricing & Configuration ────────────────────────────── */}
      <div className="space-y-4">
        <SectionLabel>Pricing &amp; Configuration</SectionLabel>

        {/* Base Price + Product Type — side by side */}
        <div className="grid grid-cols-2 gap-4">

          {/* Base Price */}
          <div>
            <label className={LABEL}>
              Base Price (NZD) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/40">
                $
              </span>
              <input
                type="number"
                value={values.basePrice}
                onChange={(e) => set('basePrice', e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                disabled={saving}
                className={`${FIELD_BASE} pl-8`}
              />
            </div>
          </div>

          {/* Product Type */}
          <div>
            <label className={LABEL}>
              Product Type <span className="text-red-500">*</span>
            </label>
            <select
              value={typeMode === 'other' ? 'other' : values.productType}
              onChange={handleTypeSelect}
              disabled={saving}
              className={FIELD_BASE}
            >
              {PRESET_TYPES.map((t) => (
                <option key={t} value={t}>{PRESET_LABELS[t]}</option>
              ))}
              <option value="other">Other…</option>
            </select>

            {/* Custom type input — revealed only when "Other" is selected */}
            {typeMode === 'other' && (
              <input
                type="text"
                value={customType}
                onChange={handleCustomType}
                placeholder="e.g. jacket, polo, vest"
                maxLength={64}
                disabled={saving}
                className={`${FIELD_BASE} mt-2`}
                autoFocus
              />
            )}
          </div>
        </div>

        {/* Storefront Visibility */}
        <div>
          <label className={LABEL}>Storefront Visibility</label>
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
            {values.isActive
              ? 'Active — visible in storefront'
              : 'Inactive — hidden from storefront'}
          </button>
        </div>

        {/* Print pricing group is a garment-only concept; Badge prices via quantity tiers instead. */}
        {showPrintPricingGroup && values.kind === 'Garment' && (
          <PrintPricingGroupField
            value={values.printPricingGroupId}
            onChange={(v) => set('printPricingGroupId', v)}
            disabled={saving}
          />
        )}
      </div>

      {/* ── Section 3: Product Kind & Selling Model (Jira 9504) ──────────────── */}
      <div className="space-y-4">
        <SectionLabel>Product Kind &amp; Selling Model</SectionLabel>

        <div>
          <label className={LABEL}>
            Product Kind <span className="text-red-500">*</span>
          </label>
          <select
            value={values.kind}
            onChange={(e) => handleKindChange(e.target.value as ProductKind)}
            disabled={saving}
            className={FIELD_BASE}
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-black/50" style={{ letterSpacing: '-0.14px' }}>
            {KIND_OPTIONS.find((k) => k.value === values.kind)?.hint}
          </p>
          {values.kind === 'Banner' && (
            <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800" style={{ letterSpacing: '-0.14px' }}>
              Banner is quote-only. Customers submit requirements (size, material, finishing) and a design;
              no online price or payment is taken. You quote it manually from the enquiry afterwards. Set a
              minimum quantity and turn on Design Upload if artwork is required.
            </p>
          )}
          {values.kind === 'Other' && (
            <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800" style={{ letterSpacing: '-0.14px' }}>
              Other storefront pricing is not implemented yet. The product saves with a manual-quote
              pricing model and has no automated price.
            </p>
          )}
        </div>

        {/* Pricing model is auto-selected from kind; shown read-only so the pairing stays valid. */}
        <div>
          <label className={LABEL}>Pricing Model</label>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-black/[0.08] bg-black/[0.02] px-4 py-3 text-sm text-black/70" style={{ letterSpacing: '-0.14px' }}>
            <span className="h-2 w-2 rounded-full bg-black/30" />
            {PRICING_MODEL_LABEL[values.pricingModel]}
            <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">auto from kind</span>
          </div>
        </div>

        {/* Minimum quantity + design-upload required: most relevant to Badge but valid for any kind. */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>
              Minimum Quantity <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={values.minimumQuantity}
              onChange={(e) => set('minimumQuantity', e.target.value)}
              placeholder="1"
              disabled={saving}
              className={FIELD_BASE}
            />
            <p className="mt-1.5 text-xs text-black/50" style={{ letterSpacing: '-0.14px' }}>
              Smallest order quantity. {isBadge ? 'Badge orders below this are rejected.' : 'Usually 1 for garments.'}
            </p>
          </div>

          <div>
            <label className={LABEL}>Design Upload</label>
            <button
              type="button"
              role="switch"
              aria-checked={values.designUploadRequired}
              disabled={saving}
              onClick={() => set('designUploadRequired', !values.designUploadRequired)}
              className={[
                'flex w-full items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm transition-colors',
                values.designUploadRequired
                  ? 'border-black/30 bg-black/[0.03] text-black'
                  : 'border-black/[0.08] bg-black/[0.02] text-black/55',
              ].join(' ')}
              style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
            >
              <span className={[
                'h-2 w-2 rounded-full',
                values.designUploadRequired ? 'bg-black' : 'bg-black/25',
              ].join(' ')} />
              {values.designUploadRequired ? 'Design required at item level' : 'Design optional'}
            </button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <p
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          style={{ letterSpacing: '-0.14px' }}
        >
          {error}
        </p>
      )}

      {/* Action row */}
      <div className="flex items-center gap-3 border-t border-black/[0.06] pt-5">
        <Button type="submit" size="sm" loading={saving}>
          Save Product
        </Button>
        <Button
          type="button"
          variant="glass"
          size="sm"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </Button>

        {/* Dirty indicator — visible only when fields have changed and not currently saving */}
        {isDirty && !saving && (
          <span className="ml-1 font-mono text-[10px] uppercase tracking-[0.54px] text-amber-600">
            Unsaved changes
          </span>
        )}
      </div>

    </form>
  )
}
