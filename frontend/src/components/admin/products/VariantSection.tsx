'use client'

import { useState } from 'react'
import { VariantMatrixEditor } from './VariantMatrixEditor'
import { VariantInventoryPanel } from './VariantInventoryPanel'
import type { ProductVariant } from '@/types'

interface Props {
  productId: string
  initialVariants: ProductVariant[]
  onColorsChange?: (colors: string[]) => void
}

export function VariantSection({ productId, initialVariants, onColorsChange }: Props) {
  const [variants, setVariants] = useState<ProductVariant[]>(initialVariants)

  return (
    <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
      <div className="mb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Variants</p>
        <h2 className="mt-1 text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
          Sizes and colours
        </h2>
      </div>

      <VariantMatrixEditor
        productId={productId}
        variants={variants}
        onSaved={setVariants}
        onColorsChange={onColorsChange}
      />

      <VariantInventoryPanel
        productId={productId}
        variants={variants}
        onInventoryUpdated={(updated) =>
          setVariants((prev) => prev.map((v) => (v.id === updated.id ? updated : v)))
        }
      />
    </section>
  )
}
