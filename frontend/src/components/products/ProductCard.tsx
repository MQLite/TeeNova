import Link from 'next/link'
import type { ProductListItem } from '@/types'

interface ProductCardProps {
  product: ProductListItem
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
    >
      {/* Image area */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-50 to-brand-50 aspect-square">
        {product.primaryImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.primaryImageUrl}
            alt={product.name}
            className="h-full w-full object-contain p-6 transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <TShirtPlaceholder />
          </div>
        )}

        {/* Product type badge */}
        <div className="absolute left-3 top-3">
          <span className="inline-flex items-center rounded-full bg-brand-600/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
            {product.productType}
          </span>
        </div>

        {/* Hover overlay with CTA */}
        <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-gray-900/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-4">
          <span className="w-full rounded-xl bg-white py-2.5 text-center text-sm font-bold text-gray-900 shadow-lg">
            Customize Now →
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors line-clamp-1">
          {product.name}
        </h3>
        <p className="text-xs text-gray-400">{product.variantCount} variants available</p>
        <div className="mt-auto pt-2 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">From</span>
            <p className="text-lg font-bold text-brand-600">${product.basePrice.toFixed(2)}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-all duration-200">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  )
}

function TShirtPlaceholder() {
  return (
    <svg viewBox="0 0 200 220" className="h-32 w-32 text-brand-200" fill="currentColor">
      <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
    </svg>
  )
}
