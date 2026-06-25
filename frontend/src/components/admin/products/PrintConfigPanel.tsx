'use client'

import { ProductPrintPricingGroupAssignment } from './ProductPrintPricingGroupAssignment'
import { PrintPricesSection } from './PrintPricesSection'
import { PrintOptionsMatrix } from './PrintOptionsMatrix'
import type { Product } from '@/types'

interface Props {
  product: Product
  variantSizes: string[]
  onProductUpdated: (product: Product) => void
}

function Subsection({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-black/[0.06] pt-5 first:border-t-0 first:pt-0">
      {children}
    </div>
  )
}

export function PrintConfigPanel({ product, variantSizes, onProductUpdated }: Props) {
  return (
    <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
      <div className="mb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
          Product Setup
        </p>
        <h2 className="mt-1 text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
          Print Config
        </h2>
        <p className="mt-2 text-sm leading-6 text-black/55" style={{ letterSpacing: '-0.14px' }}>
          Configure print availability and print-only prices for this product. Garment price remains fixed.
        </p>
      </div>

      <div className="space-y-5">
        <Subsection>
          <ProductPrintPricingGroupAssignment
            product={product}
            onSaved={onProductUpdated}
          />
        </Subsection>

        <Subsection>
          <PrintPricesSection
            printPricingGroupId={product.printPricingGroupId}
            variantSizes={variantSizes}
            embedded
          />
        </Subsection>

        <Subsection>
          <PrintOptionsMatrix
            productId={product.id}
            variantSizes={variantSizes}
          />
        </Subsection>
      </div>
    </section>
  )
}
