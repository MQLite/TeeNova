'use client'

import Link from 'next/link'
import { ProductPrintPricingGroupAssignment } from './ProductPrintPricingGroupAssignment'
import { PrintPricesSection } from './PrintPricesSection'
import type { Product } from '@/types'

interface Props {
  product: Product
  onProductUpdated: (product: Product) => void
}

function Subsection({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-black/[0.06] pt-5 first:border-t-0 first:pt-0">
      {children}
    </div>
  )
}

export function PrintConfigPanel({ product, onProductUpdated }: Props) {
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
            embedded
          />
        </Subsection>

        <Subsection>
          <div className="space-y-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
                Print Options Matrix
              </p>
              <h3 className="mt-1 text-base text-black" style={{ fontWeight: 540 }}>
                Customer-selectable print options
              </h3>
              <p className="mt-1 text-sm leading-6 text-black/55">
                Print options control what customers can select. Product default applies unless a garment size has selected override options.
              </p>
            </div>

            <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-black" style={{ fontWeight: 480 }}>
                    Matrix editor moved to its own page
                  </p>
                  <p className="mt-1 text-xs leading-5 text-black/45">
                    The product detail page stays light; open the matrix when you need to edit scoped print options.
                  </p>
                </div>
                <Link
                  href={`/admin/print-config/products/${product.id}/print-options`}
                  className="inline-flex shrink-0 items-center justify-center rounded-full bg-black px-4 py-2 text-sm text-white transition-opacity hover:opacity-85"
                  style={{ fontWeight: 480 }}
                >
                  Open Matrix
                </Link>
              </div>
            </div>
          </div>
        </Subsection>
      </div>
    </section>
  )
}
