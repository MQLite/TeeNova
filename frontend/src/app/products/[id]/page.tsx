'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { customizationApi } from '@/api/customization'
import { filesApi } from '@/api/files'
import { useCartStore } from '@/features/cart/cart-store'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PrintPositionSelector } from '@/components/products/PrintPositionSelector'
import { DesignPreview } from '@/components/products/DesignPreview'
import type { Product, ProductVariant, PrintPositionOption, PrintPosition, UploadedAsset } from '@/types'

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const addItem = useCartStore((s) => s.addItem)

  const [product, setProduct] = useState<Product | null>(null)
  const [positions, setPositions] = useState<PrintPositionOption[]>([])
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null)
  const [uploadedAsset, setUploadedAsset] = useState<UploadedAsset | null>(null)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  const [addedToCart, setAddedToCart] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    Promise.all([catalogApi.getProduct(id), customizationApi.getPrintPositions()])
      .then(([p, pos]) => {
        setProduct(p)
        setPositions(pos)
        const first = p.variants.find((v) => v.isAvailable)
        if (first) setSelectedVariant(first)
        const front = pos.find((p) => p.name === 'FrontCenter')
        if (front) setSelectedPosition(front.value)
      })
      .finally(() => setLoading(false))
  }, [id])

  async function handleFileUpload(file: File) {
    setUploading(true)
    try {
      const asset = await filesApi.upload(file)
      setUploadedAsset(asset)
    } finally {
      setUploading(false)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  function handleAddToCart() {
    if (!product || !selectedVariant) return
    const positionName = positions.find((p) => p.value === selectedPosition)?.name as PrintPosition | undefined
    addItem({
      productId: product.id,
      productVariantId: selectedVariant.id,
      productName: product.name,
      variantLabel: `${selectedVariant.color} / ${selectedVariant.size}`,
      unitPrice: product.basePrice + selectedVariant.priceAdjustment,
      quantity,
      uploadedAssetId: uploadedAsset?.assetId,
      uploadedAssetUrl: uploadedAsset?.fileUrl,
      printPosition: positionName,
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
  const effectivePrice = product.basePrice + (selectedVariant?.priceAdjustment ?? 0)
  const uniqueColors = [...new Set(product.variants.map((v) => v.color))]
  const uniqueSizes = [...new Set(product.variants.map((v) => v.size))]
  const totalPrice = effectivePrice * quantity

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
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">

          {/* ── Column 1: Product image ── */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white ">
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

              {/* Product highlights */}
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
                <span className="text-3xl font-extrabold text-brand-600">${effectivePrice.toFixed(2)}</span>
                {selectedVariant?.priceAdjustment !== 0 && selectedVariant?.priceAdjustment && (
                  <span className="text-xs text-gray-400">
                    (+${selectedVariant.priceAdjustment.toFixed(2)} for this size)
                  </span>
                )}
              </div>
            </div>

            {/* Colour selector */}
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800">Colour</p>
                <span className="text-sm font-medium text-brand-600">{selectedVariant?.color}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {uniqueColors.map((color) => {
                  const isSelected = selectedVariant?.color === color
                  return (
                    <button
                      key={color}
                      onClick={() => {
                        const v = product.variants.find(
                          (vr) => vr.color === color && vr.size === selectedVariant?.size && vr.isAvailable
                        ) ?? product.variants.find((vr) => vr.color === color && vr.isAvailable)
                        if (v) setSelectedVariant(v)
                      }}
                      className={`rounded-xl border-2 px-3.5 py-1.5 text-sm font-medium transition-all ${
                        isSelected
                          ? 'border-brand-600 bg-brand-50 text-brand-700 shadow-sm'
                          : 'border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600'
                      }`}
                    >
                      {color}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Size selector */}
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800">Size</p>
                <span className="text-sm font-medium text-brand-600">{selectedVariant?.size}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {uniqueSizes.map((size) => {
                  const v = product.variants.find(
                    (vr) => vr.size === size && vr.color === selectedVariant?.color
                  )
                  const isSelected = selectedVariant?.size === size
                  const isAvailable = v?.isAvailable ?? false
                  return (
                    <button
                      key={size}
                      disabled={!isAvailable}
                      onClick={() => { if (v) setSelectedVariant(v) }}
                      className={`min-w-[3rem] rounded-xl border-2 py-1.5 text-sm font-semibold transition-all
                        disabled:opacity-40 disabled:cursor-not-allowed
                        ${isSelected
                          ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                          : 'border-gray-200 text-gray-700 hover:border-brand-300'}`}
                    >
                      {size}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Quantity */}
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
              <p className="mb-3 text-sm font-semibold text-gray-800">Quantity</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600 transition-colors text-lg font-bold"
                >
                  −
                </button>
                <span className="w-12 text-center text-lg font-bold text-gray-900">{quantity}</span>
                <button
                  onClick={() => setQuantity(q => Math.min(99, q + 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600 transition-colors text-lg font-bold"
                >
                  +
                </button>
                <span className="ml-auto text-sm font-medium text-gray-500">
                  Subtotal: <strong className="text-gray-900">${totalPrice.toFixed(2)}</strong>
                </span>
              </div>
            </div>

            {/* Upload design */}
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Upload Your Design</p>
              <label
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-all
                  ${dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'}
                  ${uploadedAsset ? 'border-green-300 bg-green-50' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
                    <p className="text-sm font-medium text-brand-600">Uploading…</p>
                  </div>
                ) : uploadedAsset ? (
                  <div className="flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={uploadedAsset.fileUrl}
                      alt="Uploaded design"
                      className="h-16 w-16 rounded-xl object-contain border border-gray-200 shadow-sm"
                    />
                    <p className="text-sm font-semibold text-green-700">✓ {uploadedAsset.originalFileName}</p>
                    <p className="text-xs text-gray-400">Click to replace</p>
                  </div>
                ) : (
                  <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <UploadIcon />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">
                        Drag & drop or <span className="text-brand-600">browse</span>
                      </p>
                      <p className="mt-1 text-xs text-gray-400">PNG, JPEG, SVG or WebP · max 10 MB</p>
                    </div>
                  </>
                )}
              </label>
            </div>

            {/* Print position */}
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
              <PrintPositionSelector
                positions={positions}
                selected={selectedPosition}
                onChange={setSelectedPosition}
              />
            </div>

            {/* Add to cart CTA */}
            <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-purple-50 border border-brand-100 p-5">
              <Button
                size="lg"
                onClick={handleAddToCart}
                disabled={!selectedVariant}
                loading={uploading}
                className="w-full text-base py-4"
              >
                {addedToCart ? (
                  <span className="flex items-center gap-2">
                    <span>✓</span> Added to Cart!
                  </span>
                ) : (
                  `Add to Cart — $${totalPrice.toFixed(2)}`
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

          {/* ── Column 3: Live preview ── */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-4">
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                <DesignPreview
                  productImageUrl={primaryImage?.url ?? null}
                  designUrl={uploadedAsset?.fileUrl ?? null}
                  selectedPosition={selectedPosition}
                  positions={positions}
                />
              </div>

              {/* Info card */}
              <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
                <h4 className="text-sm font-bold text-brand-900 mb-2">Design Tips</h4>
                <ul className="space-y-1.5 text-xs text-brand-700">
                  <li className="flex gap-1.5"><span>→</span> Use high-res images (300 DPI+)</li>
                  <li className="flex gap-1.5"><span>→</span> PNG with transparent background works best</li>
                  <li className="flex gap-1.5"><span>→</span> SVG files give the sharpest results</li>
                  <li className="flex gap-1.5"><span>→</span> We review all designs before printing</li>
                </ul>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

function UploadIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  )
}
