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
            <div className="mt-3 grid grid-cols-3 gap-2">
              {['Custom badges', 'Bulk pricing', 'Fast ship'].map((tag) => (
                <div key={tag} className="card flex items-center justify-center py-2.5 text-center">
                  <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">{tag}</span>
                </div>
              ))}
            </div>
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
                {heroUnit !== null ? (
                  <p className="text-2xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.72px' }}>
                    From {formatMoneyNZD(heroUnit)}{' '}
                    <span className="text-base text-black/55" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                      each for {minQuantity}+
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
                    Pricing available on request.
                  </p>
                )}
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                  Minimum order {minQuantity} {minQuantity === 1 ? 'piece' : 'pieces'} · unit price by quantity
                </p>
              </div>
            </div>

            {tiers.length > 0 && (
              <div className="card p-6">
                <div className="mb-3">
                  <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                    Quantity pricing
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                    Unit price per badge · the more you order, the lower the price
                  </p>
                </div>
                <div className="overflow-hidden rounded-2xl border border-black/[0.08]">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-black/[0.02]">
                        <th className="px-4 py-2 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Quantity</th>
                        <th className="px-4 py-2 text-right font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Unit price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.06]">
                      {tiers.map((tier) => {
                        const applied = pricing?.appliedTierMinQuantity === tier.minQuantity
                        return (
                          <tr key={tier.id} className={applied ? 'bg-black/[0.03]' : ''}>
                            <td className="px-4 py-2.5 text-black/70" style={{ letterSpacing: '-0.14px' }}>
                              {tier.minQuantity}+
                              {applied && (
                                <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-[0.54px] text-black/55">
                                  Applied
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right text-black" style={{ fontWeight: 480 }}>
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
              <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                Quantity
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
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
                className="w-32 rounded-xl border border-black/[0.10] bg-white px-4 py-2.5 text-sm text-black outline-none transition-colors focus:border-black [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
                badges
              </span>
            </div>
            {!quantityValid && (
              <p className="mt-2 text-sm text-amber-700" style={{ letterSpacing: '-0.14px' }}>
                Quantity must be at least {minQuantity}.
              </p>
            )}
          </div>

          {/* Design upload */}
          <div className="card p-6">
            <div className="mb-4">
              <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                Your design {designRequired && <span className="text-red-500">*</span>}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                {designRequired ? 'Required — upload your artwork' : 'Optional — upload your artwork'}
              </p>
            </div>

            {asset ? (
              <div className="flex items-center gap-4 rounded-2xl border border-black/[0.08] bg-black/[0.02] p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.fileUrl} alt={asset.originalFileName} className="h-16 w-16 rounded-lg border border-black/[0.08] bg-white object-contain p-1" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-black" style={{ letterSpacing: '-0.14px' }}>{asset.originalFileName}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-green-600">Design uploaded</p>
                </div>
                <button
                  type="button"
                  onClick={removeUpload}
                  className="rounded-full border border-black/[0.12] px-3 py-1.5 text-xs text-black/60 transition-colors hover:border-black/30 hover:text-black"
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
                  dragOver ? 'border-black/40 bg-black/[0.03]' : 'border-black/[0.12] hover:border-black/25',
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
                <span className="text-sm text-black/60" style={{ letterSpacing: '-0.14px' }}>
                  {uploading ? 'Uploading…' : 'Drag & drop or click to upload your design'}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/35">
                  PNG, JPG, or PDF
                </span>
              </label>
            )}
            {uploadError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{uploadError}</p>
            )}

            <div className="mt-4">
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
                Design note (optional)
              </label>
              <textarea
                value={designNote}
                onChange={(e) => setDesignNote(e.target.value)}
                rows={2}
                placeholder="Any notes about colours, placement, or finish"
                className="w-full resize-none rounded-2xl border border-black/[0.10] bg-white px-4 py-3 text-sm text-black placeholder:text-black/30 outline-none focus:border-black/30"
              />
            </div>
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
            <p className="mt-3 text-center text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
              Frontend prices are previews only. Final order pricing is recalculated by the backend at checkout.
            </p>
            {designRequired && !asset && (
              <p className="mt-3 text-center text-xs text-amber-700" style={{ letterSpacing: '-0.14px' }}>
                A design upload is required for this product.
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

          <ProductDetailsSection description={product.description} />
        </div>
      </div>
    </div>
  )
}
