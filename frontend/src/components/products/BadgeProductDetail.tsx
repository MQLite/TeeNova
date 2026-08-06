'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { filesApi } from '@/api/files'
import { pricingApi } from '@/api/pricing'
import { ProductImageGallery } from '@/components/products/ProductImageGallery'
import { ProductDetailsSection } from '@/components/products/ProductDetailsSection'
import { useCartStore } from '@/features/cart/cart-store'
import { friendlyBadgeError } from '@/lib/badge-errors'
import { formatMoneyNZD } from '@/lib/pricing'
import type { PriceCalculationResponse, Product, ProductQuantityPriceTier, UploadedAsset } from '@/types'

interface Props {
  product: Product
}

/** Active quantity tiers, lowest break first. Inactive tiers never reach the public GET, but filter defensively. */
function activeTiersSorted(tiers: ProductQuantityPriceTier[]): ProductQuantityPriceTier[] {
  return tiers
    .filter((t) => t.isActive)
    .sort((a, b) => a.minQuantity - b.minQuantity || a.sortOrder - b.sortOrder)
}

/**
 * Badge storefront detail (Jira 9504). Renders the quantity-tier unit pricing UX with item-level
 * design upload — no color/size variants, no print area/size selectors, no print tier table. The
 * backend is the sole pricing authority: the live quote and order send productId + quantity + design
 * only (no variant, no prints, no price fields).
 */
export function BadgeProductDetail({ product }: Props) {
  const addItem = useCartStore((state) => state.addItem)

  const tiers = useMemo(() => activeTiersSorted(product.quantityPriceTiers), [product.quantityPriceTiers])
  const lowestTier = tiers[0] ?? null

  const minQuantity = Math.max(1, product.minimumQuantity)
  const [quantity, setQuantity] = useState<number>(minQuantity)
  const [quantityInput, setQuantityInput] = useState<string>(String(minQuantity))
  const [debouncedQuantity, setDebouncedQuantity] = useState<number>(minQuantity)

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

  const designRequired = product.designUploadRequired
  const designSatisfied = !designRequired || Boolean(asset)
  const quantityValid = Number.isInteger(quantity) && quantity >= minQuantity

  // Debounce quantity so rapid typing batches into a single quote.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuantity(quantity), 400)
    return () => window.clearTimeout(t)
  }, [quantity])

  // Live quote — productId + quantity only. No variantId, no prints, no price fields (Jira 9504).
  useEffect(() => {
    if (!quantityValid) {
      setPricing(null)
      setPricingLoading(false)
      setPricingError(null)
      return
    }

    let cancelled = false
    setPricingLoading(true)
    setPricingError(null)

    pricingApi
      .calculatePricing({ productId: product.id, quantity: debouncedQuantity, prints: [] })
      .then((result) => {
        if (cancelled) return
        setPricing(result)
      })
      .catch((err) => {
        if (cancelled) return
        setPricing(null)
        setPricingError(friendlyBadgeError(err, 'Pricing preview is temporarily unavailable.'))
      })
      .finally(() => {
        if (!cancelled) setPricingLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [product.id, debouncedQuantity, quantityValid])

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
      const uploaded = await filesApi.upload(file)
      setAsset(uploaded)
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
    if (!designSatisfied) {
      setAddToCartError('Upload your design before adding this product to cart.')
      return
    }
    if (pricingLoading || !pricing) {
      setAddToCartError('Wait for the price preview to finish before adding to cart.')
      return
    }

    const note = designNote.trim()
    // Per-design cart key so different artwork/notes are separate lines, while re-adding the same
    // design merges quantities (Jira 9504). No variant/print signature for Badge.
    const cartItemKey = `badge:${product.id}:${asset?.assetId ?? 'noasset'}:${note}`

    addItem({
      cartItemKey,
      productId: product.id,
      productName: product.name,
      unitPrice: pricing.unitPrice,
      quantity,
      kind: 'Badge',
      pricingModel: 'QuantityTierUnit',
      minimumQuantity: minQuantity,
      // Badge carries no variant and no prints; design lives at item level.
      printPricingGroupId: null,
      uploadedAssetId: asset?.assetId,
      uploadedAssetUrl: asset?.fileUrl,
      designNote: note || undefined,
    })

    setAddedToCart(true)
  }

  const displayedImages = product.images
  const activeImage =
    (selectedImageId ? displayedImages.find((i) => i.id === selectedImageId) : null) ??
    displayedImages[0] ??
    null

  const heroUnit = lowestTier?.unitPrice ?? null
  const lineTotal = pricing?.lineTotal ?? null
  const unitPrice = pricing?.unitPrice ?? null

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
            <div className="mt-3 grid grid-cols-2 gap-2">
              {/* Jira 10303: the third pill was an unverified delivery-speed claim and was removed;
                  no approved turnaround or delivery rule exists to support one. */}
              {['Custom badges', 'Bulk pricing'].map((tag) => (
                <div key={tag} className="card flex items-center justify-center py-2.5 text-center">
                  <span className="eyebrow text-ink-muted">{tag}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="card p-6">
              <span className="mb-3 inline-block rounded-full border border-line px-3 py-0.5 eyebrow text-ink-muted">
                {product.productType}
              </span>
              <h1 className="text-2xl text-ink" style={{ fontWeight: 600 }}>
                {product.name}
              </h1>
              <div className="mt-3">
                {heroUnit !== null ? (
                  <p className="text-2xl text-ink" style={{ fontWeight: 600, letterSpacing: '-0.72px' }}>
                    From {formatMoneyNZD(heroUnit)}{' '}
                    <span className="text-base text-ink-muted" style={{ fontWeight: 500 }}>
                      each for {minQuantity}+
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-ink-muted">
                    Pricing available on request.
                  </p>
                )}
                <p className="mt-1 eyebrow text-ink-muted">
                  Minimum order {minQuantity} {minQuantity === 1 ? 'piece' : 'pieces'} · unit price by quantity
                </p>
              </div>
            </div>

            {tiers.length > 0 && (
              <div className="card p-6">
                <div className="mb-3">
                  <p className="text-sm text-ink" style={{ fontWeight: 500 }}>
                    Quantity pricing
                  </p>
                  <p className="mt-1 eyebrow text-ink-muted">
                    Unit price per badge · the more you order, the lower the price
                  </p>
                </div>
                <div className="overflow-hidden rounded-2xl border border-line">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-surface-sunken">
                        <th className="px-4 py-2 text-left eyebrow text-ink-muted">Quantity</th>
                        <th className="px-4 py-2 text-right eyebrow text-ink-muted">Unit price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.06]">
                      {tiers.map((tier) => {
                        const applied = pricing?.appliedTierMinQuantity === tier.minQuantity
                        return (
                          <tr key={tier.id} className={applied ? 'bg-surface-sunken' : ''}>
                            <td className="px-4 py-2.5 text-ink-secondary">
                              {tier.minQuantity}+
                              {applied && (
                                <span className="ml-2 rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] uppercase tracking-[0.54px] text-ink-muted">
                                  Applied
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right text-ink" style={{ fontWeight: 500 }}>
                              {formatMoneyNZD(tier.unitPrice)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-5">
          {/* Quantity */}
          <div className="card p-6">
            <div className="mb-4">
              <p className="text-sm text-ink" style={{ fontWeight: 500 }}>
                Quantity
              </p>
              <p className="mt-1 eyebrow text-ink-muted">
                Minimum {minQuantity} · enter any quantity at or above the minimum
              </p>
            </div>
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
                className="w-32 rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-ink outline-none transition-colors focus:border-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="eyebrow text-ink-muted">
                badges
              </span>
            </div>
            {!quantityValid && (
              <p className="mt-2 text-sm text-amber-700">
                Quantity must be at least {minQuantity}.
              </p>
            )}
          </div>

          {/* Design upload */}
          <div className="card p-6">
            <div className="mb-4">
              <p className="text-sm text-ink" style={{ fontWeight: 500 }}>
                Your design {designRequired && <span className="text-red-500">*</span>}
              </p>
              <p className="mt-1 eyebrow text-ink-muted">
                {designRequired ? 'Required — upload your artwork' : 'Optional — upload your artwork'}
              </p>
            </div>

            {asset ? (
              <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface-sunken p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.fileUrl} alt={asset.originalFileName} className="h-16 w-16 rounded-lg border border-line bg-white object-contain p-1" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{asset.originalFileName}</p>
                  <p className="eyebrow text-green-600">Design uploaded</p>
                </div>
                <button
                  type="button"
                  onClick={removeUpload}
                  className="rounded-full border border-line-strong px-3 py-1.5 text-xs text-ink-secondary transition-colors hover:border-line-control hover:text-ink"
                >
                  Replace
                </button>
              </div>
            ) : (
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const file = e.dataTransfer.files?.[0]
                  if (file) handleUpload(file)
                }}
                className={[
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors',
                  dragOver ? 'border-black/40 bg-surface-sunken' : 'border-line-strong hover:border-line-control',
                ].join(' ')}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleUpload(file)
                  }}
                />
                <span className="text-sm text-ink-secondary">
                  {uploading ? 'Uploading…' : 'Drag & drop or click to upload your design'}
                </span>
                <span className="eyebrow text-ink-muted">
                  PNG, JPG, WebP, AI or PDF · max 20 MB
                </span>
              </label>
            )}
            {uploadError && (
              <p className="mt-3 rounded-lg border border-danger-border bg-danger-surface px-4 py-2.5 text-sm text-danger">{uploadError}</p>
            )}

            <div className="mt-4">
              <label className="mb-1.5 block eyebrow text-ink-muted">
                Design note (optional)
              </label>
              <textarea
                value={designNote}
                onChange={(e) => setDesignNote(e.target.value)}
                rows={2}
                placeholder="Any notes about colours, placement, or finish"
                className="w-full resize-none rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink placeholder:text-ink-muted outline-none focus:border-ink"
              />
            </div>
          </div>

          {/* Live quote */}
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink" style={{ fontWeight: 500 }}>
                Price preview
              </p>
              {pricingLoading && (
                <span className="eyebrow text-ink-muted">Updating…</span>
              )}
            </div>
            {pricingError ? (
              <p className="mt-3 rounded-lg border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger">{pricingError}</p>
            ) : unitPrice !== null && lineTotal !== null ? (
              <div className="mt-3 space-y-2 rounded-2xl bg-surface-sunken px-4 py-3 text-sm">
                <div className="flex items-center justify-between text-ink-secondary">
                  <span>Unit price</span>
                  <span className="text-ink-secondary">{formatMoneyNZD(unitPrice)}</span>
                </div>
                <div className="flex items-center justify-between text-ink-secondary">
                  <span>Quantity</span>
                  <span className="text-ink-secondary">{quantity}</span>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-2">
                  <span className="text-ink" style={{ fontWeight: 600 }}>Line total</span>
                  <span className="text-ink" style={{ fontWeight: 600 }}>{formatMoneyNZD(lineTotal)}</span>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">
                Enter a quantity to preview pricing.
              </p>
            )}
          </div>

          {/* Add to cart */}
          <div className="card p-6">
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={pricingLoading || uploading || !quantityValid || !designSatisfied || !pricing}
              className="btn-black w-full py-3 text-sm disabled:opacity-40"
            >
              {addedToCart ? 'Added to Cart' : `Add ${quantity} to Cart`}
            </button>
            <p className="mt-3 text-center text-sm text-ink-muted">
              Frontend prices are previews only. Final order pricing is recalculated by the backend at checkout.
            </p>
            {designRequired && !asset && (
              <p className="mt-3 text-center text-xs text-amber-700">
                A design upload is required for this product.
              </p>
            )}
            {addToCartError && (
              <p className="mt-3 rounded-lg border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger">{addToCartError}</p>
            )}
            {addedToCart && (
              <div className="mt-3 flex gap-2">
                <Link href="/products" className="btn-glass btn-sm flex-1 text-center">Continue Shopping</Link>
                <Link href="/cart" className="btn-black btn-sm flex-1 text-center">View Cart</Link>
              </div>
            )}
          </div>

          <ProductDetailsSection description={product.description} />
        </div>
      </div>
    </div>
  )
}
