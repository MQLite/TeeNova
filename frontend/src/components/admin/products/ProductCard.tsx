import Link from 'next/link'
import type { ProductListItem } from '@/types'

interface ProductCardProps {
  product: ProductListItem
}

function ProductImagePlaceholder() {
  return (
    <svg viewBox="0 0 200 220" className="h-24 w-24 text-black/[0.06]" fill="currentColor">
      <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
    </svg>
  )
}

export function ProductCard({ product }: ProductCardProps) {
  const imageUrl = product.thumbnailUrl ?? product.primaryImageUrl

  return (
    <div className="card group overflow-hidden p-0 transition-shadow hover:shadow-card">
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-gradient-to-br from-black/[0.02] via-white to-black/[0.04]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={product.name}
            className="h-full w-full object-contain p-8 transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <ProductImagePlaceholder />
        )}

        <div className="absolute left-4 top-4 flex items-center gap-2">
          <span className="rounded-full border border-black/[0.08] bg-white/90 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/55 backdrop-blur-sm">
            {product.productType}
          </span>
          {!product.isActive && (
            <span className="rounded-full border border-amber-200 bg-amber-50/90 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-amber-700 backdrop-blur-sm">
              Inactive
            </span>
          )}
        </div>
      </div>

      <div className="border-t border-black/[0.08] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
              {product.name}
            </h3>
            <p className="mt-1 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
              {product.variantCount} variant{product.variantCount !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="rounded-full bg-black/[0.04] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.54px] text-black">
            ${product.basePrice.toFixed(2)}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Link
            href={`/admin/products/${product.id}`}
            className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm text-white transition-opacity hover:opacity-85"
            style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
          >
            View
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href={`/admin/products/${product.id}/edit`}
            className="inline-flex items-center gap-2 rounded-full border border-black/[0.10] bg-white px-3 py-1.5 text-[11px] text-black/70 transition-colors hover:bg-black/[0.03] hover:text-black"
            style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </Link>
        </div>
      </div>
    </div>
  )
}
