'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { filesApi } from '@/api/files'
import { pricingApi } from '@/api/pricing'
import { ProductImageGallery } from '@/components/products/ProductImageGallery'
import { ProductDetailsSection } from '@/components/products/ProductDetailsSection'
import { useCartStore } from '@/features/cart/cart-store'
import { friendlyBannerError } from '@/lib/banner-errors'
import { formatMoneyNZD } from '@/lib/pricing'
import type {
  BannerDetailInput,
  BannerDimensionUnit,
  BannerMaterial,
  PriceCalculationResponse,
  Product,
  ProductFixedSizePriceOption,
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

const UNIT_LABEL: Record<BannerDimensionUnit, string> = { Mm: 'mm', Cm: 'cm', M: 'm' }

const FIELD = [
  'w-full rounded-2xl border border-black/[0.10] bg-white px-4 py-3 text-sm text-black',
  'placeholder:text-black/30 focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/[0.06]',
].join(' ')
const LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55'

/** Active fixed-size options, lowest sortOrder first. Inactive rows never reach the public GET, but filter defensively. */
function activeOptionsSorted(options: ProductFixedSizePriceOption[]): ProductFixedSizePriceOption[] {
  return options
    .filter((o) => o.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
}

function optionDimensions(option: ProductFixedSizePriceOption): string {
  return `${option.width} × ${option.height} ${UNIT_LABEL[option.unit]}`
}

/**
 * FixedSize Banner storefront detail (Jira 9517). Unlike the CustomQuoteOnly enquiry flow, a FixedSize
 * Banner IS automatically priced: the customer selects one active {@link ProductFixedSizePriceOption},
 * uploads a design and enters quantity + material/finishing/stand/notes, gets a live backend quote, and
 * can add the priced item to cart for normal checkout. The backend is the sole pricing authority — the
 * quote and order send only the selected option id (via bannerDetail.sizePresetId) plus non-priced config;
 * never any price. No variant, no prints, no ConfigurationJson.
 */
export function FixedSizeBannerProductDetail({ product }: Props) {
  const addItem = useCartStore((state) => state.addItem)

  const options = useMemo(() => activeOptionsSorted(product.fixedSizePriceOptions), [product.fixedSizePriceOptions])
  const minQuantity = Math.max(1, product.minimumQuantity)
  const designRequired = product.designUploadRequired

  // ── Form state ────────────────────────────────────────────────────────────
  const [quantity, setQuantity] = useState<number>(minQuantity)
  const [quantityInput, setQuantityInput] = useState<string>(String(minQuantity))
  const [debouncedQuantity, setDebouncedQuantity] = useState<number>(minQuantity)

  const [sizePresetId, setSizePresetId] = useState<string>(options[0]?.id ?? '')

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

  const [pricing, setPricing] = useState<PriceCalculationResponse | null>(null)
  const [pricingLoading, setPricingLoading] = useState(false)
  const [pricingError, setPricingError] = useState<string | null>(null)

  const [addedToCart, setAddedToCart] = useState(false)
  const [addToCartError, setAddToCartError] = useState<string | null>(null)

  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)

  const selectedOption = useMemo(
    () => options.find((o) => o.id === sizePresetId) ?? null,
    [options, sizePresetId],
  )

  const designSatisfied = !designRequired || Boolean(asset)
  const quantityValid = Number.isInteger(quantity) && quantity >= minQuantity
  const materialSatisfied = material !== 'Other' || materialDisplayName.trim().length > 0
  const sizeSelected = Boolean(selectedOption)

  // Build the non-priced Banner config sent to the backend (quote + order). The server reads only
  // sizePresetId for pricing and snapshots the trusted option size — width/height/unit stay null here.
  const buildBannerDetail = useMemo(
    () => (): BannerDetailInput => ({
      sizeMode: 'Preset',
      sizePresetId: sizePresetId || null,
      sizeLabel: selectedOption?.label ?? null,
      width: null,
      height: null,
      unit: null,
      material,
      materialDisplayName: material === 'Other' ? materialDisplayName.trim() : null,
      finishingEyelets,
      finishingHemming,
      finishingPolePocket,
      finishingOther: finishingOther.trim() || null,
      standIncluded,
      standReplacementOnly,
      notes: notes.trim() || null,
    }),
    [
      sizePresetId, selectedOption, material, materialDisplayName, finishingEyelets, finishingHemming,
      finishingPolePocket, finishingOther, standIncluded, standReplacementOnly, notes,
    ],
  )

  // Debounce quantity so rapid typing batches into a single quote.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuantity(quantity), 400)
    return () => window.clearTimeout(t)
  }, [quantity])

  // Live quote — productId + quantity + the selected size option id. The backend FixedSize quote reads
  // only sizePresetId for pricing (no variant, no prints, no price), so the non-priced config fields
  // (material/finishing/stand/notes) intentionally don't re-fire the quote (Jira 9517).
  useEffect(() => {
    if (!quantityValid || !sizePresetId) {
      setPricing(null)
      setPricingLoading(false)
      setPricingError(null)
      return
    }

    let cancelled = false
    setPricingLoading(true)
    setPricingError(null)

    pricingApi
      .calculatePricing({
        productId: product.id,
        quantity: debouncedQuantity,
        prints: [],
        bannerDetail: {
          sizeMode: 'Preset',
          sizePresetId,
          material,
          finishingEyelets: false,
          finishingHemming: false,
          finishingPolePocket: false,
          standIncluded: false,
          standReplacementOnly: false,
        },
      })
      .then((result) => {
        if (cancelled) return
        setPricing(result)
      })
      .catch((err) => {
        if (cancelled) return
        setPricing(null)
        setPricingError(friendlyBannerError(err, 'Pricing preview is temporarily unavailable.'))
      })
      .finally(() => {
        if (!cancelled) setPricingLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [product.id, debouncedQuantity, quantityValid, sizePresetId, material])

  useEffect(() => {
    if (!addedToCart) return
    const t = window.setTimeout(() => setAddedToCart(false), 2500)
    return () => window.clearTimeout(t)
  }, [addedToCart])

  function commitQuantity(raw: string) {
    const parsed = parseInt(raw, 10)
    if (isNaN(parsed)) {
      setQuantity(minQuantity)
      setQuantityInput(String(minQuantity))
      return
    }
    const clamped = Math.max(minQuantity, Math.min(100000, parsed))
    setQuantity(clamped)
    setQuantityInput(String(clamped))
  }

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

  function handleAddToCart() {
    setAddToCartError(null)

    if (!quantityValid) {
      setAddToCartError(`Enter a quantity of at least ${minQuantity}.`)
      return
    }
    if (!sizeSelected) {
      setAddToCartError('Choose a fixed size before adding to cart.')
      return
    }
    if (!materialSatisfied) {
      setAddToCartError('Please name the material when choosing “Other”.')
      return
    }
    if (!designSatisfied) {
      setAddToCartError('Upload your design before adding this product to cart.')
      return
    }
    if (pricingLoading || !pricing) {
      setAddToCartError('Wait for the price preview to finish before adding to cart.')
      return
    }

    const note = designNote.trim()
    const bannerDetail = buildBannerDetail()
    // Per-configuration cart key so different size/material/finishing/design are separate lines, while
    // re-adding the same configuration merges quantities (Jira 9517). No variant/print signature.
    const configSignature = [
      bannerDetail.sizePresetId ?? '',
      bannerDetail.material,
      bannerDetail.materialDisplayName ?? '',
      bannerDetail.finishingEyelets ? 'e' : '',
      bannerDetail.finishingHemming ? 'h' : '',
      bannerDetail.finishingPolePocket ? 'p' : '',
      bannerDetail.finishingOther ?? '',
      bannerDetail.standIncluded ? 's' : '',
      bannerDetail.standReplacementOnly ? 'r' : '',
      bannerDetail.notes ?? '',
    ].join('|')
    const cartItemKey = `banner-fixed:${product.id}:${asset?.assetId ?? 'noasset'}:${note}:${configSignature}`

    addItem({
      cartItemKey,
      productId: product.id,
      productName: product.name,
      unitPrice: pricing.unitPrice,
      quantity,
      kind: 'Banner',
      pricingModel: 'FixedSize',
      minimumQuantity: minQuantity,
      // FixedSize Banner carries no variant and no prints; design + config live at item level.
      printPricingGroupId: null,
      uploadedAssetId: asset?.assetId,
      uploadedAssetUrl: asset?.fileUrl,
      designNote: note || undefined,
      bannerDetail,
    })

    setAddedToCart(true)
  }

  const displayedImages = product.images
  const activeImage =
    (selectedImageId ? displayedImages.find((i) => i.id === selectedImageId) : null) ??
    displayedImages[0] ??
    null

  const heroFrom = options.length > 0 ? Math.min(...options.map((o) => o.unitPrice)) : null
  const lineTotal = pricing?.lineTotal ?? null
  const unitPrice = pricing?.unitPrice ?? null

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-black/[0.08]">
        <div className="section-container py-3">
          <nav className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
            <Link href="/" className="hover:text-black transition-colors">Home</Link>
            <span className="opacity-40">/</span>
            <Link href="/products" className="hover:text-black transition-colors">Products</Link>
            <span className="opacity-40">/</span>
            <span className="text-black">{product.name}</span>
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
              <span className="mb-3 inline-block rounded-full border border-black/[0.08] px-3 py-0.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
                {product.productType}
              </span>
              <h1 className="text-2xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
                {product.name}
              </h1>
              <div className="mt-3">
                {heroFrom !== null ? (
                  <p className="text-2xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.72px' }}>
                    From {formatMoneyNZD(heroFrom)}{' '}
                    <span className="text-base text-black/55" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                      each
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
                    Pricing available on request.
                  </p>
                )}
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                  Banner · Fixed size · minimum order {minQuantity} {minQuantity === 1 ? 'piece' : 'pieces'}
                </p>
              </div>
            </div>

            <ProductDetailsSection description={product.description} />
          </div>
        </div>

        {options.length === 0 ? (
          <div className="mt-8 card p-6">
            <p className="text-sm text-black/60" style={{ letterSpacing: '-0.14px' }}>
              This banner has no sizes available to order online yet. Please contact the shop for a quote.
            </p>
          </div>
        ) : (
        <div className="mt-8 flex flex-col gap-5">
          {/* Size */}
          <div className="card p-6">
            <p className="mb-1 text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
              Size <span className="text-red-500">*</span>
            </p>
            <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
              Choose one standard size
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {options.map((option) => {
                const selected = option.id === sizePresetId
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSizePresetId(option.id)}
                    className={[
                      'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                      selected ? 'border-black bg-black/[0.03]' : 'border-black/[0.10] bg-white hover:border-black/30',
                    ].join(' ')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-black" style={{ letterSpacing: '-0.14px', fontWeight: selected ? 540 : 480 }}>
                        {option.label}
                      </span>
                      <span className="block font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                        {optionDimensions(option)}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-black" style={{ fontWeight: 540 }}>
                      {formatMoneyNZD(option.unitPrice)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Quantity */}
          <div className="card p-6">
            <p className="mb-1 text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>Quantity</p>
            <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
              Minimum {minQuantity}
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={minQuantity}
                max={100000}
                value={quantityInput}
                onChange={(e) => {
                  setQuantityInput(e.target.value)
                  const parsed = parseInt(e.target.value, 10)
                  if (!isNaN(parsed)) setQuantity(parsed)
                }}
                onBlur={(e) => commitQuantity(e.target.value)}
                className={`${FIELD} w-32`}
              />
              <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
                banners
              </span>
            </div>
            {!quantityValid && (
              <p className="mt-2 text-sm text-amber-700" style={{ letterSpacing: '-0.14px' }}>
                Quantity must be at least {minQuantity}.
              </p>
            )}
          </div>

          {/* Material */}
          <div className="card p-6">
            <label className={LABEL}>Material <span className="text-red-500">*</span></label>
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
            <p className="mb-4 text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>Finishing &amp; stand</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { label: 'Eyelets', checked: finishingEyelets, set: setFinishingEyelets },
                { label: 'Hemming', checked: finishingHemming, set: setFinishingHemming },
                { label: 'Pole pocket', checked: finishingPolePocket, set: setFinishingPolePocket },
                { label: 'Stand included', checked: standIncluded, set: setStandIncluded },
                { label: 'Stand replacement only', checked: standReplacementOnly, set: setStandReplacementOnly },
              ].map((opt) => (
                <label key={opt.label} className="flex cursor-pointer items-center gap-2.5 rounded-2xl border border-black/[0.08] bg-black/[0.01] px-4 py-3 text-sm text-black/70" style={{ letterSpacing: '-0.14px' }}>
                  <input type="checkbox" checked={opt.checked} onChange={(e) => opt.set(e.target.checked)} className="h-4 w-4 rounded border-black/20" />
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
            <p className="mb-1 text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
              Your design {designRequired && <span className="text-red-500">*</span>}
            </p>
            <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
              {designRequired ? 'Required — upload your artwork' : 'Optional — upload your artwork'}
            </p>
            {asset ? (
              <div className="flex items-center gap-4 rounded-2xl border border-black/[0.08] bg-black/[0.02] p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.fileUrl} alt={asset.originalFileName} className="h-16 w-16 rounded-lg border border-black/[0.08] bg-white object-contain p-1" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-black" style={{ letterSpacing: '-0.14px' }}>{asset.originalFileName}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-green-600">Design uploaded</p>
                </div>
                <button type="button" onClick={removeUpload} className="rounded-full border border-black/[0.12] px-3 py-1.5 text-xs text-black/60 transition-colors hover:border-black/30 hover:text-black">Replace</button>
              </div>
            ) : (
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) handleUpload(file) }}
                className={[
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors',
                  dragOver ? 'border-black/40 bg-black/[0.03]' : 'border-black/[0.12] hover:border-black/25',
                ].join(' ')}
              >
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUpload(file) }} />
                <span className="text-sm text-black/60" style={{ letterSpacing: '-0.14px' }}>{uploading ? 'Uploading…' : 'Drag & drop or click to upload your design'}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/35">PNG, JPG, or PDF</span>
              </label>
            )}
            {uploadError && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{uploadError}</p>}
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

          {/* Live quote */}
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                Price preview
              </p>
              {pricingLoading && (
                <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Updating…</span>
              )}
            </div>
            {pricingError ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{pricingError}</p>
            ) : unitPrice !== null && lineTotal !== null ? (
              <div className="mt-3 space-y-2 rounded-2xl bg-black/[0.02] px-4 py-3 text-sm">
                {selectedOption && (
                  <div className="flex items-center justify-between text-black/60" style={{ letterSpacing: '-0.14px' }}>
                    <span>Size</span>
                    <span className="text-black/80">{selectedOption.label} · {optionDimensions(selectedOption)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-black/60" style={{ letterSpacing: '-0.14px' }}>
                  <span>Unit price</span>
                  <span className="text-black/80">{formatMoneyNZD(unitPrice)}</span>
                </div>
                <div className="flex items-center justify-between text-black/60" style={{ letterSpacing: '-0.14px' }}>
                  <span>Quantity</span>
                  <span className="text-black/80">{quantity}</span>
                </div>
                <div className="flex items-center justify-between border-t border-black/[0.06] pt-2" style={{ letterSpacing: '-0.14px' }}>
                  <span className="text-black" style={{ fontWeight: 540 }}>Line total</span>
                  <span className="text-black" style={{ fontWeight: 540 }}>{formatMoneyNZD(lineTotal)}</span>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
                Choose a size and quantity to preview pricing.
              </p>
            )}
          </div>

          {/* Add to cart */}
          <div className="card p-6">
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={pricingLoading || uploading || !quantityValid || !sizeSelected || !materialSatisfied || !designSatisfied || !pricing}
              className="btn-black w-full py-3 text-sm disabled:opacity-40"
            >
              {addedToCart ? 'Added to Cart' : `Add ${quantity} to Cart`}
            </button>
            <p className="mt-3 text-center text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
              Frontend prices are previews only. Final order pricing is recalculated by the backend at checkout.
            </p>
            {designRequired && !asset && (
              <p className="mt-3 text-center text-xs text-amber-700" style={{ letterSpacing: '-0.14px' }}>
                A design upload is required for this banner.
              </p>
            )}
            {addToCartError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{addToCartError}</p>
            )}
            {addedToCart && (
              <div className="mt-3 flex gap-2">
                <Link href="/products" className="btn-glass btn-sm flex-1 text-center">Continue Shopping</Link>
                <Link href="/cart" className="btn-black btn-sm flex-1 text-center">View Cart</Link>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
