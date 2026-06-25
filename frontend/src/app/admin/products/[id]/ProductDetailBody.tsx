'use client'

import { useEffect, useState } from 'react'
import { ProductStatusToggle } from '@/components/admin/products/ProductStatusToggle'
import { VariantSection } from '@/components/admin/products/VariantSection'
import { PrintConfigPanel } from '@/components/admin/products/PrintConfigPanel'
import { ColorImageManager } from '@/components/admin/products/ColorImageManager'
import type { Product } from '@/types'

function getPriceRange(basePrice: number, adjustments: number[]): string {
  if (adjustments.length === 0) return `$${basePrice.toFixed(2)}`
  const min = Math.min(...adjustments)
  const max = Math.max(...adjustments)
  const start = basePrice + min
  const end = basePrice + max
  if (start === end) return `$${start.toFixed(2)}`
  return `$${start.toFixed(2)} - $${end.toFixed(2)}`
}

/** Deduplicate colors preserving first original casing, case-insensitively. */
function dedupeColors(colors: string[]): string[] {
  const seen = new Set<string>()
  return colors.filter((c) => {
    const lower = c.trim().toLowerCase()
    if (!lower || seen.has(lower)) return false
    seen.add(lower)
    return true
  })
}

interface Props {
  product: Product
}

export function ProductDetailBody({ product }: Props) {
  const [currentProduct, setCurrentProduct] = useState(product)
  const [variantColors, setVariantColors] = useState<string[]>(() =>
    dedupeColors(product.variants.map((v) => v.color)),
  )

  useEffect(() => {
    setCurrentProduct(product)
    setVariantColors(dedupeColors(product.variants.map((v) => v.color)))
  }, [product])

  const adjustments = currentProduct.variants.map((v) => v.priceAdjustment)

  // Distinct garment sizes (preserving order) for size-override scopes in the print panels.
  const variantSizes = Array.from(new Set(currentProduct.variants.map((v) => v.size).filter(Boolean)))

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <ColorImageManager
            productId={currentProduct.id}
            initialImages={currentProduct.images}
            variantColors={variantColors}
          />

          <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
            <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
              Description
            </p>
            <h2
              className="mt-1 text-lg text-black"
              style={{ fontWeight: 540, letterSpacing: '-0.26px' }}
            >
              Product overview
            </h2>
            <div className="mt-4 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-4 text-sm leading-6 text-black/70">
              {currentProduct.description?.trim() ||
                'No description has been provided for this product yet.'}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
            <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
              Overview
            </p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p
                  className="text-3xl text-black"
                  style={{ fontWeight: 540, letterSpacing: '-0.96px' }}
                >
                  ${currentProduct.basePrice.toFixed(2)}
                </p>
                <p
                  className="mt-1 text-sm text-black/55"
                  style={{ letterSpacing: '-0.14px' }}
                >
                  Base price
                </p>
              </div>
              <div className="rounded-2xl border border-black/[0.08] bg-black/[0.02] px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                  Range
                </p>
                <p
                  className="mt-1 text-sm text-black"
                  style={{ fontWeight: 480, letterSpacing: '-0.14px' }}
                >
                  {getPriceRange(currentProduct.basePrice, adjustments)}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
            <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
              Metadata
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                  Product ID
                </p>
                <p
                  className="mt-1 break-all text-sm text-black"
                  style={{ fontWeight: 480, letterSpacing: '-0.14px' }}
                >
                  {currentProduct.id}
                </p>
              </div>
              <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                  Created
                </p>
                <p
                  className="mt-1 text-sm text-black"
                  style={{ fontWeight: 480, letterSpacing: '-0.14px' }}
                >
                  {new Date(currentProduct.creationTime).toLocaleString('en-NZ', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              </div>
              <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                  Status
                </p>
                <ProductStatusToggle productId={currentProduct.id} isActive={currentProduct.isActive} />
              </div>
            </div>
          </section>
        </div>
      </div>

      <VariantSection
        productId={currentProduct.id}
        initialVariants={currentProduct.variants}
        onColorsChange={setVariantColors}
      />

      <PrintConfigPanel
        product={currentProduct}
        variantSizes={variantSizes}
        onProductUpdated={setCurrentProduct}
      />
    </>
  )
}
