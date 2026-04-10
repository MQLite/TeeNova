'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { customizationApi } from '@/api/customization'
import { filesApi } from '@/api/files'
import { useCartStore } from '@/features/cart/cart-store'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
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
  // variantQtys: variantId → quantity (only non-zero entries are meaningful)
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
    setPositionUploads((prev) => {
      const next = { ...prev }
      delete next[positionValue]
      return next
    })
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
        return posName
          ? {
              position: posName,
              uploadedAssetId: asset?.assetId,
              uploadedAssetUrl: asset?.fileUrl,
              designNote: positionNotes[posVal] || undefined,
            }
          : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    const first = printPositions[0]

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
        uploadedAssetId: first?.uploadedAssetId,
        uploadedAssetUrl: first?.uploadedAssetUrl,
        printPosition: first?.position,
      })
    })

    setAddedToCart(true)
    setTimeout(() => setAddedToCart(false), 2500)
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
          <p className="text-sm text-gray-500">Loading product…</p>
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <span className="text-6xl">😕</span>
        <h2 className="text-xl font-bold text-gray-900">Product not found</h2>
        <Button variant="secondary" asChild>
          <Link href="/products">Back to Products</Link>
        </Button>
      </div>
    )
  }

  const primaryImage = product.images.find((i) => i.isPrimary) ?? product.images[0]
  const uniqueColors = [...new Set(product.variants.map((v) => v.color))]
  const uniqueSizes = [...new Set(product.variants.map((v) => v.size))]

  // Compute totals from table
  const totalQty = Object.values(variantQtys).reduce((s, q) => s + (q > 0 ? q : 0), 0)
  const totalPrice = product.variants.reduce((sum, v) => {
    const qty = variantQtys[v.id] ?? 0
    return sum + (qty > 0 ? (product.basePrice + v.priceAdjustment) * qty : 0)
  }, 0)

  // Price adjustment note: collect unique adjustments
  const priceAdjustments = uniqueSizes
    .map((size) => {
      const v = product.variants.find((vr) => vr.size === size)
      return v && v.priceAdjustment !== 0 ? { size, adj: v.priceAdjustment } : null
    })
    .filter((x): x is { size: string; adj: number } => x !== null)

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-100">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 text-xs text-gray-500">
            <Link href="/" className="hover:text-brand-600 transition-colors">Home</Link>
            <span>›</span>
            <Link href="/products" className="hover:text-brand-600 transition-colors">Products</Link>
            <span>›</span>
            <span className="text-gray-900 font-medium">{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">

          {/* ── Column 1: Product image ── */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
                {primaryImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={primaryImage.url}
                    alt={product.name}
                    className="h-full w-full object-contain p-6"
                    style={{ minHeight: 340 }}
                  />
                ) : (
                  <div className="flex items-center justify-center bg-gradient-to-br from-gray-50 to-brand-50" style={{ minHeight: 340 }}>
                    <svg viewBox="0 0 200 220" className="h-40 w-40 text-brand-200" fill="currentColor">
                      <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
                    </svg>
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { icon: '✓', text: 'Premium cotton' },
                  { icon: '🎨', text: 'Vivid print' },
                  { icon: '📦', text: 'Fast ship' },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex flex-col items-center gap-1 rounded-xl bg-white border border-gray-100 py-2.5 text-center shadow-sm">
                    <span className="text-sm">{icon}</span>
                    <span className="text-[10px] font-medium text-gray-600">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Column 2: Options ── */}
          <div className="flex flex-col gap-6 lg:col-span-1">

            {/* Product title & price */}
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
              <Badge color="purple" className="mb-2">{product.productType}</Badge>
              <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
              {product.description && (
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{product.description}</p>
              )}
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-brand-600">${product.basePrice.toFixed(2)}</span>
                <span className="text-sm text-gray-400">per item</span>
              </div>
              {priceAdjustments.length > 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  {priceAdjustments.map((a) => `${a.size}: +$${a.adj.toFixed(2)}`).join(' · ')}
                </p>
              )}
            </div>

            {/* Print positions (multi-select) */}
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
              <PrintPositionSelector
                positions={positions}
                selected={selectedPositions}
                onChange={setSelectedPositions}
              />
            </div>

            {/* Upload designs — per position */}
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Upload Designs</p>
              {selectedPositions.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-200 py-5 text-center text-sm text-gray-400">
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
                      <div key={posVal} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-700">📍 {posLabel}</p>

                        <div className="flex items-center gap-2">
                          <label
                            className={`flex flex-1 cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed px-3 py-2 transition-all
                              ${isDragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:border-brand-300 hover:bg-gray-50'}
                              ${asset ? 'border-green-300 bg-green-50' : ''}`}
                            onDragOver={(e) => { e.preventDefault(); setDragOverPosition(posVal) }}
                            onDragLeave={() => setDragOverPosition(null)}
                            onDrop={(e) => {
                              e.preventDefault()
                              setDragOverPosition(null)
                              const file = e.dataTransfer.files[0]
                              if (file) handleFileUpload(file, posVal)
                            }}
                          >
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/svg+xml,image/webp,.ai,application/pdf"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleFileUpload(file, posVal)
                              }}
                            />
                            {isUploading ? (
                              <div className="flex items-center gap-2">
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600" />
                                <span className="text-xs text-brand-600">Uploading…</span>
                              </div>
                            ) : asset ? (
                              <div className="flex w-full items-center gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={asset.fileUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg border border-gray-200 object-contain" />
                                <span className="flex-1 truncate text-xs font-medium text-green-700">✓ {asset.originalFileName}</span>
                                <span className="shrink-0 text-[10px] text-gray-400">change</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <UploadIcon />
                                <span className="text-xs text-gray-500">Drop or click to upload</span>
                              </div>
                            )}
                          </label>
                          {asset && (
                            <button
                              type="button"
                              onClick={() => removePositionUpload(posVal)}
                              className="shrink-0 text-gray-300 transition-colors hover:text-red-400"
                              title="Remove design"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>

                        <textarea
                          rows={2}
                          value={positionNotes[posVal] ?? ''}
                          onChange={(e) => setPositionNotes((prev) => ({ ...prev, [posVal]: e.target.value }))}
                          placeholder="Input the text to print here… or describe your requirements (e.g. colour, font, size)"
                          className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 placeholder-gray-400 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                        />
                      </div>
                    )
                  })}
                </div>
              )}
              <p className="text-[10px] text-gray-400">PNG, JPG, SVG, WebP, AI, PDF · max 10 MB per file</p>
            </div>

            {/* Quantity table: Color × Size */}
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800">Select Sizes & Quantities</p>
                {totalQty > 0 && (
                  <span className="text-xs font-medium text-brand-600">{totalQty} item{totalQty !== 1 ? 's' : ''} selected</span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="pb-2 pr-3 text-left text-xs font-semibold text-gray-500 w-28">Colour</th>
                      {uniqueSizes.map((size) => {
                        const adj = product.variants.find((v) => v.size === size)?.priceAdjustment ?? 0
                        return (
                          <th key={size} className="pb-2 px-1.5 text-center text-xs font-semibold text-gray-700 min-w-[4rem]">
                            <span>{size}</span>
                            {adj !== 0 && (
                              <span className="block text-[9px] font-normal text-gray-400">+${adj.toFixed(2)}</span>
                            )}
                          </th>
                        )
                      })}
                      <th className="pb-2 pl-3 text-right text-xs font-semibold text-gray-500">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {uniqueColors.map((color) => {
                      const rowTotal = uniqueSizes.reduce((sum, size) => {
                        const v = product.variants.find((vr) => vr.color === color && vr.size === size)
                        if (!v) return sum
                        const qty = variantQtys[v.id] ?? 0
                        return sum + qty * (product.basePrice + v.priceAdjustment)
                      }, 0)

                      return (
                        <tr key={color} className="hover:bg-gray-50/50">
                          <td className="py-2 pr-3 text-xs font-medium text-gray-700 align-middle">{color}</td>
                          {uniqueSizes.map((size) => {
                            const variant = product.variants.find(
                              (vr) => vr.color === color && vr.size === size
                            )
                            const unavailable = !variant || !variant.isAvailable
                            const isFocused = focusedVariantId === variant?.id
                            const displayValue = variant
                              ? isFocused && (variantQtys[variant.id] ?? 0) === 0
                                ? ''
                                : variantQtys[variant.id] || ''
                              : ''
                            return (
                              <td key={size} className="py-2 px-1.5 text-center align-middle">
                                {unavailable ? (
                                  <span className="text-[10px] text-gray-300">—</span>
                                ) : (
                                  <input
                                    type="number"
                                    min={0}
                                    max={999}
                                    value={displayValue}
                                    placeholder={focusedVariantId === variant!.id ? '' : '0'}
                                    onFocus={() => setFocusedVariantId(variant!.id)}
                                    onBlur={() => setFocusedVariantId(null)}
                                    onChange={(e) => setQty(variant!.id, e.target.value)}
                                    className="w-14 rounded-lg border border-gray-200 bg-gray-50 px-1.5 py-1.5 text-center text-sm font-semibold text-gray-900 outline-none transition-colors focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  />
                                )}
                              </td>
                            )
                          })}
                          <td className="py-2 pl-3 text-right text-xs font-semibold text-gray-700 align-middle tabular-nums">
                            {rowTotal > 0 ? `$${rowTotal.toFixed(2)}` : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {totalQty > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-gray-100">
                        <td colSpan={uniqueSizes.length + 1} className="pt-2.5 pr-3 text-xs text-gray-500">
                          {totalQty} item{totalQty !== 1 ? 's' : ''}
                        </td>
                        <td className="pt-2.5 pl-3 text-right text-sm font-bold text-gray-900 tabular-nums">
                          ${totalPrice.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <p className="mt-3 text-[10px] text-gray-400">Enter 0 or leave blank to skip a size. Max 999 per cell.</p>
            </div>

            {/* Add to cart CTA */}
            <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-purple-50 border border-brand-100 p-5">
              <Button
                size="lg"
                onClick={handleAddToCart}
                disabled={totalQty === 0}
                loading={uploadingPosition !== null}
                className="w-full text-base py-4"
              >
                {addedToCart ? (
                  <span className="flex items-center gap-2"><span>✓</span> Added to Cart!</span>
                ) : totalQty > 0 ? (
                  `Add ${totalQty} Item${totalQty !== 1 ? 's' : ''} to Cart — $${totalPrice.toFixed(2)}`
                ) : (
                  'Select quantities above'
                )}
              </Button>
              <p className="mt-3 text-center text-xs text-gray-500">
                Free shipping on orders over $100 · NZ wide delivery
              </p>
              {addedToCart && (
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" size="sm" className="flex-1" asChild>
                    <Link href="/products">Continue Shopping</Link>
                  </Button>
                  <Button size="sm" className="flex-1" asChild>
                    <Link href="/cart">View Cart →</Link>
                  </Button>
                </div>
              )}
            </div>

          </div>

          {/* ── Column 3: Live preview (temporarily hidden) ── */}
          {null}

        </div>
      </div>
    </div>
  )
}

function UploadIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  )
}
