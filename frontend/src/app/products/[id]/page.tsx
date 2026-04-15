'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { customizationApi } from '@/api/customization'
import { filesApi } from '@/api/files'
import { useCartStore } from '@/features/cart/cart-store'
import { PrintPositionSelector } from '@/components/products/PrintPositionSelector'
import type { Product, PrintPositionOption, PrintPosition, UploadedAsset } from '@/types'

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const addItem = useCartStore((s) => s.addItem)

  const [product, setProduct] = useState<Product | null>(null)
  const [positions, setPositions] = useState<PrintPositionOption[]>([])
  const [selectedPositions, setSelectedPositions] = useState<number[]>([])
  const [positionUploads, setPositionUploads] = useState<Record<number, UploadedAsset>>({})
  const [positionNotes, setPositionNotes] = useState<Record<number, string>>({})
  const [uploadingPosition, setUploadingPosition] = useState<number | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [addedToCart, setAddedToCart] = useState(false)
  const [variantQtys, setVariantQtys] = useState<Record<string, number>>({})
  const [focusedVariantId, setFocusedVariantId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([catalogApi.getProduct(id), customizationApi.getPrintPositions()])
      .then(([p, pos]) => {
        setProduct(p)
        setPositions(pos)
        const front = pos.find((p) => p.name === 'FrontCenter')
        if (front) setSelectedPositions([front.value])
      })
      .finally(() => setLoading(false))
  }, [id])

  async function handleFileUpload(file: File, positionValue: number) {
    setUploadingPosition(positionValue)
    try {
      const asset = await filesApi.upload(file)
      setPositionUploads((prev) => ({ ...prev, [positionValue]: asset }))
    } finally {
      setUploadingPosition(null)
    }
  }

  function removePositionUpload(positionValue: number) {
    setPositionUploads((prev) => { const n = { ...prev }; delete n[positionValue]; return n })
  }

  function setQty(variantId: string, value: string) {
    const n = Math.max(0, Math.min(999, parseInt(value) || 0))
    setVariantQtys((prev) => ({ ...prev, [variantId]: n }))
  }

  function handleAddToCart() {
    if (!product) return
    const printPositions = selectedPositions
      .map((posVal) => {
        const posName = positions.find((p) => p.value === posVal)?.name as PrintPosition | undefined
        const asset = positionUploads[posVal]
        return posName ? {
          position: posName,
          uploadedAssetId: asset?.assetId,
          uploadedAssetUrl: asset?.fileUrl,
          designNote: positionNotes[posVal] || undefined,
        } : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    Object.entries(variantQtys).forEach(([variantId, qty]) => {
      if (qty <= 0) return
      const variant = product.variants.find((v) => v.id === variantId)
      if (!variant) return
      addItem({
        productId: product.id,
        productVariantId: variant.id,
        productName: product.name,
        variantLabel: `${variant.color} / ${variant.size}`,
        unitPrice: product.basePrice + variant.priceAdjustment,
        quantity: qty,
        printPositions,
      })
    })
    setAddedToCart(true)
    setTimeout(() => setAddedToCart(false), 2500)
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-black" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-5xl font-thin text-black/20">—</p>
        <h2 className="text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>Product not found</h2>
        <Link href="/products" className="btn-glass btn-sm">Back to Products</Link>
      </div>
    )
  }

  const primaryImage = product.images.find((i) => i.isPrimary) ?? product.images[0]
  const uniqueColors = [...new Set(product.variants.map((v) => v.color))]
  const uniqueSizes = [...new Set(product.variants.map((v) => v.size))]
  const totalQty = Object.values(variantQtys).reduce((s, q) => s + (q > 0 ? q : 0), 0)
  const totalPrice = product.variants.reduce((sum, v) => {
    const qty = variantQtys[v.id] ?? 0
    return sum + (qty > 0 ? (product.basePrice + v.priceAdjustment) * qty : 0)
  }, 0)
  const priceAdjustments = uniqueSizes
    .map((size) => { const v = product.variants.find((vr) => vr.size === size); return v && v.priceAdjustment !== 0 ? { size, adj: v.priceAdjustment } : null })
    .filter((x): x is { size: string; adj: number } => x !== null)

  return (
    <div className="min-h-screen bg-white">
      {/* Breadcrumb */}
      <div className="border-b border-black/[0.08]">
        <div className="section-container py-3">
          <nav className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
            <Link href="/" className="hover:text-black transition-colors">Home</Link>
            <span className="opacity-40">›</span>
            <Link href="/products" className="hover:text-black transition-colors">Products</Link>
            <span className="opacity-40">›</span>
            <span className="text-black">{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="section-container py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">

          {/* ── Left: Image ── */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="card overflow-hidden">
              {primaryImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={primaryImage.url} alt={product.name}
                  className="h-full w-full object-contain p-8" style={{ minHeight: 360 }} />
              ) : (
                <div className="flex items-center justify-center bg-black/[0.02]" style={{ minHeight: 360 }}>
                  <svg viewBox="0 0 200 220" className="h-36 w-36 text-black/[0.06]" fill="currentColor">
                    <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {['Premium cotton', 'Vivid print', 'Fast ship'].map((t) => (
                <div key={t} className="card flex items-center justify-center py-2.5 text-center">
                  <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: Options ── */}
          <div className="flex flex-col gap-5">

            {/* Title & price */}
            <div className="card p-6">
              <span className="mb-3 inline-block rounded-full border border-black/[0.08] px-3 py-0.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
                {product.productType}
              </span>
              <h1 className="text-2xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
                {product.name}
              </h1>
              {product.description && (
                <p className="mt-2 text-sm leading-relaxed text-black/50"
                   style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
                  {product.description}
                </p>
              )}
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl text-black" style={{ fontWeight: 400, letterSpacing: '-0.96px' }}>
                  ${product.basePrice.toFixed(2)}
                </span>
                <span className="text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>per item</span>
              </div>
              {priceAdjustments.length > 0 && (
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
                  {priceAdjustments.map((a) => `${a.size}: +$${a.adj.toFixed(2)}`).join(' · ')}
                </p>
              )}
            </div>

            {/* Print positions */}
            <div className="card p-6">
              <PrintPositionSelector
                positions={positions}
                selected={selectedPositions}
                onChange={setSelectedPositions}
              />
            </div>

            {/* Upload designs */}
            <div className="card p-6">
              <p className="mb-4 text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                Upload Designs
              </p>
              {selectedPositions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-black/[0.12] py-6 text-center text-sm text-black/55"
                   style={{ letterSpacing: '-0.14px' }}>
                  Select a print position above first
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedPositions.map((posVal) => {
                    const posLabel = positions.find((p) => p.value === posVal)?.displayLabel ?? ''
                    const asset = positionUploads[posVal]
                    const isUploading = uploadingPosition === posVal
                    const isDragOver = dragOverPosition === posVal

                    return (
                      <div key={posVal} className="space-y-2 rounded-lg border border-black/[0.08] p-3">
                        <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">{posLabel}</p>
                        <div className="flex items-center gap-2">
                          <label
                            className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 transition-colors ${
                              isDragOver ? 'border-black bg-black/[0.03]' :
                              asset ? 'border-green-300 bg-green-50' :
                              'border-black/[0.12] hover:border-black/30'
                            }`}
                            onDragOver={(e) => { e.preventDefault(); setDragOverPosition(posVal) }}
                            onDragLeave={() => setDragOverPosition(null)}
                            onDrop={(e) => { e.preventDefault(); setDragOverPosition(null); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f, posVal) }}
                          >
                            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,.ai,application/pdf"
                              className="hidden"
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, posVal) }} />
                            {isUploading ? (
                              <div className="flex items-center gap-2">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-black" />
                                <span className="text-xs text-black/55">Uploading…</span>
                              </div>
                            ) : asset ? (
                              <div className="flex w-full items-center gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={asset.fileUrl} alt="" className="h-7 w-7 shrink-0 rounded border border-black/[0.08] object-contain" />
                                <span className="flex-1 truncate text-xs text-black">{asset.originalFileName}</span>
                                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.54px] text-black/50">change</span>
                              </div>
                            ) : (
                              <span className="text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>Drop or click to upload</span>
                            )}
                          </label>
                          {asset && (
                            <button type="button" onClick={() => removePositionUpload(posVal)}
                              className="shrink-0 text-black/25 hover:text-red-500 transition-colors">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <textarea rows={2}
                          value={positionNotes[posVal] ?? ''}
                          onChange={(e) => setPositionNotes((prev) => ({ ...prev, [posVal]: e.target.value }))}
                          placeholder="Describe your design requirements…"
                          className="form-input resize-none text-xs" />
                      </div>
                    )
                  })}
                </div>
              )}
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                PNG, JPG, SVG, WebP, AI, PDF · max 10 MB
              </p>
            </div>

            {/* Quantity table */}
            <div className="card p-6">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                  Sizes &amp; Quantities
                </p>
                {totalQty > 0 && (
                  <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
                    {totalQty} item{totalQty !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-black/[0.08]">
                      <th className="pb-2 pr-3 text-left font-mono text-[11px] uppercase tracking-[0.54px] text-black/50 w-28 font-normal">
                        Colour
                      </th>
                      {uniqueSizes.map((size) => {
                        const adj = product.variants.find((v) => v.size === size)?.priceAdjustment ?? 0
                        return (
                          <th key={size} className="pb-2 px-1.5 text-center font-mono text-[11px] uppercase tracking-[0.54px] text-black/50 font-normal min-w-[4rem]">
                            {size}
                            {adj !== 0 && <span className="block text-[9px] opacity-60">+${adj.toFixed(2)}</span>}
                          </th>
                        )
                      })}
                      <th className="pb-2 pl-3 text-right font-mono text-[11px] uppercase tracking-[0.54px] text-black/50 font-normal">
                        Subtotal
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06]">
                    {uniqueColors.map((color) => {
                      const rowTotal = uniqueSizes.reduce((sum, size) => {
                        const v = product.variants.find((vr) => vr.color === color && vr.size === size)
                        if (!v) return sum
                        return sum + (variantQtys[v.id] ?? 0) * (product.basePrice + v.priceAdjustment)
                      }, 0)
                      return (
                        <tr key={color}>
                          <td className="py-2 pr-3 text-xs text-black align-middle" style={{ letterSpacing: '-0.14px' }}>
                            {color}
                          </td>
                          {uniqueSizes.map((size) => {
                            const variant = product.variants.find((vr) => vr.color === color && vr.size === size)
                            const unavailable = !variant || !variant.isAvailable
                            const isFocused = focusedVariantId === variant?.id
                            const displayValue = variant
                              ? isFocused && (variantQtys[variant.id] ?? 0) === 0 ? '' : variantQtys[variant.id] || ''
                              : ''
                            return (
                              <td key={size} className="py-2 px-1.5 text-center align-middle">
                                {unavailable ? (
                                  <span className="text-[10px] text-black/20">—</span>
                                ) : (
                                  <input type="number" min={0} max={999}
                                    value={displayValue}
                                    placeholder="0"
                                    onFocus={() => setFocusedVariantId(variant!.id)}
                                    onBlur={() => setFocusedVariantId(null)}
                                    onChange={(e) => setQty(variant!.id, e.target.value)}
                                    className="w-14 rounded-lg border border-black/[0.10] bg-white px-1.5 py-1.5 text-center text-sm text-black outline-none transition-colors focus:border-black [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  />
                                )}
                              </td>
                            )
                          })}
                          <td className="py-2 pl-3 text-right text-xs tabular-nums text-black align-middle">
                            {rowTotal > 0 ? `$${rowTotal.toFixed(2)}` : <span className="text-black/20">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {totalQty > 0 && (
                    <tfoot>
                      <tr className="border-t border-black/[0.08]">
                        <td colSpan={uniqueSizes.length + 1} className="pt-2.5 pr-3 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
                          {totalQty} item{totalQty !== 1 ? 's' : ''}
                        </td>
                        <td className="pt-2.5 pl-3 text-right text-sm text-black tabular-nums" style={{ fontWeight: 540 }}>
                          ${totalPrice.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                Leave blank or enter 0 to skip. Max 999 per cell.
              </p>
            </div>

            {/* Add to cart */}
            <div className="card p-6">
              <button
                onClick={handleAddToCart}
                disabled={totalQty === 0 || uploadingPosition !== null}
                className="btn-black w-full py-3 text-sm disabled:opacity-40"
              >
                {addedToCart
                  ? '✓ Added to Cart'
                  : totalQty > 0
                  ? `Add ${totalQty} Item${totalQty !== 1 ? 's' : ''} — $${totalPrice.toFixed(2)}`
                  : 'Select quantities above'}
              </button>
              <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
                Free shipping over $100 · NZ wide delivery
              </p>
              {addedToCart && (
                <div className="mt-3 flex gap-2">
                  <Link href="/products" className="btn-glass btn-sm flex-1 text-center">Continue Shopping</Link>
                  <Link href="/cart" className="btn-black btn-sm flex-1 text-center">View Cart →</Link>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
