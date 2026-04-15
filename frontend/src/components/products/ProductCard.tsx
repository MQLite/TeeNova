import Link from 'next/link'
import type { ProductListItem } from '@/types'

interface ProductCardProps {
  product: ProductListItem
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="group card flex flex-col overflow-hidden transition-shadow hover:shadow-card"
    >
      {/* Image area */}
      <div className="relative aspect-square overflow-hidden bg-black/[0.02]">
        {product.primaryImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.primaryImageUrl}
            alt={product.name}
            className="h-full w-full object-contain p-6 transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <TShirtPlaceholder />
          </div>
        )}

        {/* Product type badge */}
        <div className="absolute left-3 top-3">
          <span className="font-mono rounded-full border border-black/[0.08] bg-white/90 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.54px] text-black/50 backdrop-blur-sm">
            {product.productType}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 border-t border-black/[0.08] px-4 py-3.5">
        <h3
          className="text-sm text-black line-clamp-1"
          style={{ fontWeight: 480, letterSpacing: '-0.14px' }}
        >
          {product.name}
        </h3>
        <p className="text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>
          {product.variantCount} variants
        </p>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">From</span>
            <p className="text-base text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
              ${product.basePrice.toFixed(2)}
            </p>
          </div>
          <span className="text-xs text-black/55 underline underline-offset-2 transition-opacity group-hover:opacity-50"
                style={{ letterSpacing: '-0.14px' }}>
            Customize →
          </span>
        </div>
      </div>
    </Link>
  )
}

function TShirtPlaceholder() {
  return (
    <svg viewBox="0 0 200 220" className="h-28 w-28 text-black/[0.06]" fill="currentColor">
      <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
    </svg>
  )
}
