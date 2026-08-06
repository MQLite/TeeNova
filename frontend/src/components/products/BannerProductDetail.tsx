'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { filesApi } from '@/api/files'
import { bannerEnquiriesApi } from '@/api/banner-enquiries'
import { ProductImageGallery } from '@/components/products/ProductImageGallery'
import { ProductDetailsSection } from '@/components/products/ProductDetailsSection'
import { friendlyBannerError } from '@/lib/banner-errors'
import type {
  BannerDimensionUnit,
  BannerEnquiryResult,
  BannerMaterial,
  BannerSizeMode,
  Product,
  UploadedAsset,
} from '@/types'

interface Props {
  product: Product
}

const MATERIAL_OPTIONS: { value: BannerMaterial; label: string }[] = [
  { value: 'PullUp', label: 'Pull-up banner' },
  { value: 'Pvc', label: 'PVC banner' },
  { value: 'Mesh', label: 'Mesh banner' },
  { value: 'Fabric', label: 'Fabric banner' },
  { value: 'Other', label: 'Other (specify)' },
]

const UNIT_OPTIONS: { value: BannerDimensionUnit; label: string }[] = [
  { value: 'Mm', label: 'mm' },
  { value: 'Cm', label: 'cm' },
  { value: 'M', label: 'm' },
]

// MVP preset labels (no preset price table exists yet — these capture a size label only, Jira 9512).
const PRESET_LABELS = ['Pull-up 850×2000 mm', 'Pull-up 1000×2000 mm', 'Banner 1000×3000 mm'] as const
const PRESET_OTHER = '__other__'

const FIELD = [
  'w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink',
  'placeholder:text-ink-muted focus:border-ink focus:outline-none focus:ring-2 focus:ring-black/[0.06]',
].join(' ')
const LABEL = 'mb-1.5 block eyebrow text-ink-muted'

/**
 * Banner storefront detail (Jira 9512). Banner is CustomQuoteOnly / enquiry-first: there is NO live
 * price, NO add-to-cart, and NO payment. The customer enters size/material/finishing/quantity + design
 * + contact details and submits a quote request to the anonymous Banner enquiry endpoint. The backend
 * validates and persists a BannerQuoteRequest (never an order, never a payment session).
 */
export function BannerProductDetail({ product }: Props) {
  const minQuantity = Math.max(1, product.minimumQuantity)
  const designRequired = product.designUploadRequired

  // ── Form state ────────────────────────────────────────────────────────────
  const [quantity, setQuantity] = useState<string>(String(minQuantity))
  const [sizeMode, setSizeMode] = useState<BannerSizeMode>('Custom')

  const [presetChoice, setPresetChoice] = useState<string>(PRESET_LABELS[0])
  const [presetOther, setPresetOther] = useState<string>('')

  const [width, setWidth] = useState<string>('')
  const [height, setHeight] = useState<string>('')
  const [unit, setUnit] = useState<BannerDimensionUnit>('Mm')

  const [material, setMaterial] = useState<BannerMaterial>('PullUp')
  const [materialDisplayName, setMaterialDisplayName] = useState<string>('')

  const [finishingEyelets, setFinishingEyelets] = useState(false)
  const [finishingHemming, setFinishingHemming] = useState(false)
  const [finishingPolePocket, setFinishingPolePocket] = useState(false)
  const [finishingOther, setFinishingOther] = useState('')
  const [standIncluded, setStandIncluded] = useState(false)
  const [standReplacementOnly, setStandReplacementOnly] = useState(false)
  const [notes, setNotes] = useState('')

  const [asset, setAsset] = useState<UploadedAsset | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [designNote, setDesignNote] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [message, setMessage] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<BannerEnquiryResult | null>(null)

  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const displayedImages = product.images
  const activeImage =
    (selectedImageId ? displayedImages.find((i) => i.id === selectedImageId) : null) ??
    displayedImages[0] ??
    null

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      setAsset(await filesApi.upload(file))
    } catch (err) {
      setAsset(null)
      setUploadError(err instanceof Error ? err.message : 'Could not upload this design. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  function removeUpload() {
    setAsset(null)
    setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function validate(): string | null {
    const qty = parseInt(quantity, 10)
    if (isNaN(qty) || qty < minQuantity) return `Enter a quantity of at least ${minQuantity}.`

    if (sizeMode === 'Custom') {
      const w = parseFloat(width)
      const h = parseFloat(height)
      if (isNaN(w) || w <= 0 || isNaN(h) || h <= 0) return 'Enter a width and height greater than 0 for a custom size.'
    } else {
      const label = presetChoice === PRESET_OTHER ? presetOther.trim() : presetChoice
      if (!label) return 'Choose a preset size or enter a size label.'
    }

    if (material === 'Other' && !materialDisplayName.trim()) return 'Please name the material when choosing “Other”.'
    if (designRequired && !asset) return 'Please upload your artwork before requesting a quote.'
    if (!customerName.trim()) return 'Please enter your name.'
    if (!customerEmail.trim() || !customerEmail.includes('@')) return 'Please enter a valid email address.'
    return null
  }

  async function handleSubmit() {
    setSubmitError(null)
    const validationError = validate()
    if (validationError) {
      setSubmitError(validationError)
      return
    }

    const qty = parseInt(quantity, 10)
    const presetLabel = presetChoice === PRESET_OTHER ? presetOther.trim() : presetChoice

    setSubmitting(true)
    try {
      const enquiry = await bannerEnquiriesApi.create({
        productId: product.id,
        quantity: qty,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim() || null,
        message: message.trim() || null,
        uploadedAssetId: asset?.assetId ?? null,
        uploadedAssetUrl: asset?.fileUrl ?? null,
        designNote: designNote.trim() || null,
        bannerDetail: {
          sizeMode,
          sizePresetId: null,
          sizeLabel: sizeMode === 'Preset' ? presetLabel : null,
          width: sizeMode === 'Custom' ? parseFloat(width) : null,
          height: sizeMode === 'Custom' ? parseFloat(height) : null,
          unit: sizeMode === 'Custom' ? unit : null,
          material,
          materialDisplayName: material === 'Other' ? materialDisplayName.trim() : null,
          finishingEyelets,
          finishingHemming,
          finishingPolePocket,
          finishingOther: finishingOther.trim() || null,
          standIncluded,
          standReplacementOnly,
          notes: notes.trim() || null,
        },
      })
      setResult(enquiry)
    } catch (err) {
      setSubmitError(friendlyBannerError(err, 'Could not submit your quote request. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="min-h-screen bg-white">
        <div className="section-container py-16">
          <div className="mx-auto max-w-xl card p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
              <span className="text-2xl">✓</span>
            </div>
            <h1 className="text-xl text-ink" style={{ fontWeight: 600 }}>
              Quote request received
            </h1>
            <p className="mt-3 text-sm text-ink-secondary">
              {result.message}
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              If email confirmations are enabled, a copy of your request will arrive in your inbox shortly.
            </p>
            <p className="mt-2 eyebrow text-ink-muted">
              {result.productName} · {result.quantity} pcs · Ref {result.id.slice(0, 8).toUpperCase()}
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Link href="/products" className="btn-glass btn-sm">Continue browsing</Link>
              <Link href="/" className="btn-black btn-sm">Back home</Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-line">
        <div className="section-container py-3">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 eyebrow text-ink-muted">
            <Link href="/" className="hover:text-ink transition-colors">Home</Link>
            <span className="opacity-40">/</span>
            <Link href="/products" className="hover:text-ink transition-colors">Products</Link>
            <span className="opacity-40">/</span>
            <span className="text-ink">{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="section-container py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="lg:self-start">
            <ProductImageGallery
              productName={product.name}
              activeImage={activeImage}
              images={displayedImages}
              onSelectImage={setSelectedImageId}
            />
          </div>

          <div className="flex flex-col gap-5">
            <div className="card p-6">
              <span className="mb-3 inline-block rounded-full border border-line px-3 py-0.5 eyebrow text-ink-muted">
                {product.productType}
              </span>
              <h1 className="text-2xl text-ink" style={{ fontWeight: 600 }}>
                {product.name}
              </h1>
              <div className="mt-3 rounded-2xl border border-line bg-surface-sunken px-4 py-3">
                <p className="text-sm text-ink" style={{ fontWeight: 500 }}>
                  Quote-only product
                </p>
                <p className="mt-1 text-sm text-ink-secondary">
                  Tell us your size, material and finishing and upload your design. We’ll confirm the
                  price before any payment — no online checkout for banners.
                </p>
              </div>
            </div>

            <ProductDetailsSection description={product.description} />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-5">
          {/* Quantity */}
          <div className="card p-6">
            <label className={LABEL}>Quantity</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={minQuantity}
                max={100000}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={`${FIELD} w-32`}
              />
              <span className="eyebrow text-ink-muted">
                min {minQuantity}
              </span>
            </div>
          </div>

          {/* Size */}
          <div className="card p-6">
            <p className="mb-4 text-sm text-ink" style={{ fontWeight: 500 }}>Size</p>
            <div className="mb-4 flex gap-2">
              {(['Custom', 'Preset'] as BannerSizeMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSizeMode(mode)}
                  className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
                    sizeMode === mode
                      ? 'border-ink bg-surface-inverse text-white'
                      : 'border-line-strong bg-white text-ink-muted hover:border-line-control hover:text-ink'
                  }`}
                >
                  {mode === 'Custom' ? 'Custom size' : 'Preset size'}
                </button>
              ))}
            </div>

            {sizeMode === 'Custom' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={LABEL}>Width</label>
                  <input type="number" min={0} step="0.01" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="e.g. 850" className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Height</label>
                  <input type="number" min={0} step="0.01" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="e.g. 2000" className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Unit</label>
                  <select value={unit} onChange={(e) => setUnit(e.target.value as BannerDimensionUnit)} className={FIELD}>
                    {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <label className={LABEL}>Preset size</label>
                <select value={presetChoice} onChange={(e) => setPresetChoice(e.target.value)} className={FIELD}>
                  {PRESET_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  <option value={PRESET_OTHER}>Other / custom label…</option>
                </select>
                {presetChoice === PRESET_OTHER && (
                  <input
                    type="text"
                    value={presetOther}
                    onChange={(e) => setPresetOther(e.target.value)}
                    placeholder="Describe the size you need"
                    maxLength={256}
                    className={`${FIELD} mt-2`}
                  />
                )}
              </div>
            )}
          </div>

          {/* Material */}
          <div className="card p-6">
            <label className={LABEL}>Material</label>
            <select value={material} onChange={(e) => setMaterial(e.target.value as BannerMaterial)} className={FIELD}>
              {MATERIAL_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            {material === 'Other' && (
              <input
                type="text"
                value={materialDisplayName}
                onChange={(e) => setMaterialDisplayName(e.target.value)}
                placeholder="Name the material"
                maxLength={128}
                className={`${FIELD} mt-2`}
              />
            )}
          </div>

          {/* Finishing + stand */}
          <div className="card p-6">
            <p className="mb-4 text-sm text-ink" style={{ fontWeight: 500 }}>Finishing &amp; stand</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { label: 'Eyelets', checked: finishingEyelets, set: setFinishingEyelets },
                { label: 'Hemming', checked: finishingHemming, set: setFinishingHemming },
                { label: 'Pole pocket', checked: finishingPolePocket, set: setFinishingPolePocket },
                { label: 'Stand included', checked: standIncluded, set: setStandIncluded },
                { label: 'Stand replacement only', checked: standReplacementOnly, set: setStandReplacementOnly },
              ].map((opt) => (
                <label key={opt.label} className="flex cursor-pointer items-center gap-2.5 rounded-2xl border border-line bg-surface-sunken px-4 py-3 text-sm text-ink-secondary">
                  <input type="checkbox" checked={opt.checked} onChange={(e) => opt.set(e.target.checked)} className="h-4 w-4 rounded border-line-control" />
                  {opt.label}
                </label>
              ))}
            </div>
            <div className="mt-4">
              <label className={LABEL}>Other finishing (optional)</label>
              <input type="text" value={finishingOther} onChange={(e) => setFinishingOther(e.target.value)} placeholder="Any other finishing requirements" maxLength={512} className={FIELD} />
            </div>
          </div>

          {/* Design upload */}
          <div className="card p-6">
            <p className="mb-1 text-sm text-ink" style={{ fontWeight: 500 }}>
              Your design {designRequired && <span className="text-red-500">*</span>}
            </p>
            <p className="mb-4 eyebrow text-ink-muted">
              {designRequired ? 'Required — upload your artwork' : 'Optional — upload your artwork'}
            </p>
            {asset ? (
              <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface-sunken p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.fileUrl} alt={asset.originalFileName} className="h-16 w-16 rounded-lg border border-line bg-white object-contain p-1" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{asset.originalFileName}</p>
                  <p className="eyebrow text-green-600">Design uploaded</p>
                </div>
                <button type="button" onClick={removeUpload} className="rounded-full border border-line-strong px-3 py-1.5 text-xs text-ink-secondary transition-colors hover:border-line-control hover:text-ink">Replace</button>
              </div>
            ) : (
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) handleUpload(file) }}
                className={[
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors',
                  dragOver ? 'border-black/40 bg-surface-sunken' : 'border-line-strong hover:border-line-control',
                ].join(' ')}
              >
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUpload(file) }} />
                <span className="text-sm text-ink-secondary">{uploading ? 'Uploading…' : 'Drag & drop or click to upload your design'}</span>
                <span className="eyebrow text-ink-muted">PNG, JPG, WebP, AI or PDF · max 20 MB</span>
              </label>
            )}
            {uploadError && <p className="mt-3 rounded-lg border border-danger-border bg-danger-surface px-4 py-2.5 text-sm text-danger">{uploadError}</p>}
            <div className="mt-4">
              <label className={LABEL}>Design note (optional)</label>
              <textarea value={designNote} onChange={(e) => setDesignNote(e.target.value)} rows={2} placeholder="Any notes about colours, placement, or finish" className={`${FIELD} resize-none`} />
            </div>
          </div>

          {/* Notes */}
          <div className="card p-6">
            <label className={LABEL}>Additional notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything else we should know about this banner" maxLength={2000} className={`${FIELD} resize-none`} />
          </div>

          {/* Contact */}
          <div className="card p-6">
            <p className="mb-4 text-sm text-ink" style={{ fontWeight: 500 }}>Your contact details</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Name <span className="text-red-500">*</span></label>
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={256} className={FIELD} />
              </div>
              <div>
                <label className={LABEL}>Email <span className="text-red-500">*</span></label>
                <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} maxLength={256} className={FIELD} />
              </div>
              <div>
                <label className={LABEL}>Phone (optional)</label>
                <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} maxLength={32} className={FIELD} />
              </div>
              <div>
                <label className={LABEL}>Message (optional)</label>
                <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} className={FIELD} />
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="card p-6">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || uploading}
              className="btn-black w-full py-3 text-sm disabled:opacity-40"
            >
              {submitting ? 'Submitting…' : 'Request a quote'}
            </button>
            <p className="mt-3 text-center text-sm text-ink-muted">
              No payment is taken now. We’ll confirm your price before any payment.
            </p>
            {designRequired && !asset && (
              <p className="mt-3 text-center text-xs text-amber-700">
                A design upload is required for this banner.
              </p>
            )}
            {submitError && <p className="mt-3 rounded-lg border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger">{submitError}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
