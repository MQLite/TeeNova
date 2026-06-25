import Link from 'next/link'
import { resolveImageUrl } from '@/lib/image-utils'
import { formatMoneyNZD } from '@/lib/pricing'
import type { ProductListItem } from '@/types'

interface ProductCardProps {
  product: ProductListItem
}

export function ProductCard({ product }: ProductCardProps) {
  // Lead with the printed "from" price when print tiers exist; otherwise fall back to the base
  // garment price. fromPrice (Jira 9203) = fixed garment price + cheapest achievable print price.
  const showPrinted = product.hasPriceTiers && product.fromPrice !== null

  // Hero card (Jira 9303): when the backend resolves a reference print break, the card mirrors the
  // product-detail hero card. The same copy rules as ProductHeroPrice keep them consistent.
  const hero = product.hero
  const quantityCopy = hero
    ? hero.tierMinQuantity === 10
      ? '(Minimum 10 pieces)'
      : `Reference price for ${hero.quantity} ${hero.quantity === 1 ? 'piece' : 'pieces'}`
    : ''
  const garmentLabel = hero
    ? hero.garmentFromPrice !== product.basePrice
      ? `From ${formatMoneyNZD(hero.garmentFromPrice)}`
      : formatMoneyNZD(product.basePrice)
    : ''

  return (
    <Link
      href={`/products/${product.id}`}
      className="group card flex flex-col overflow-hidden transition-shadow hover:shadow-card"
    >
      {/* Image area */}
      <div className="relative aspect-square overflow-hidden bg-black/[0.02]">
        {resolveImageUrl(product.primaryImageUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveImageUrl(product.primaryImageUrl)!}
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

      {/* Info — mirrors the product-detail hero card (Jira 9303). */}
      <div className="flex flex-1 flex-col border-t border-black/[0.08] px-4 py-4">
        <h3
          className="text-sm text-black line-clamp-1"
          style={{ fontWeight: 480, letterSpacing: '-0.14px' }}
        >
          {product.name}
        </h3>

        {hero ? (
          <div className="mt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
              Garment + print · from
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-3xl text-black" style={{ fontWeight: 400, letterSpacing: '-0.96px' }}>
                {formatMoneyNZD(hero.price)}
              </span>
              <span className="text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>ea</span>
            </div>
            <p className="mt-0.5 text-xs text-black" style={{ letterSpacing: '-0.14px', fontWeight: 480 }}>
              for {hero.printSizeName} printing + garment
            </p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
              {quantityCopy}
            </p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
              Garment {garmentLabel} ea{hero.sizeAdjustments.length > 0 ? ' · varies by size' : ''}
            </p>
            {hero.sizeAdjustments.length > 0 && (
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">
                {hero.sizeAdjustments.map((a) => `${a.size}: +$${a.adjustment.toFixed(2)}`).join(' | ')}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
              {showPrinted ? 'Garment + print · from' : 'Garment price'}
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-3xl text-black" style={{ fontWeight: 400, letterSpacing: '-0.96px' }}>
                {showPrinted ? formatMoneyNZD(product.fromPrice!) : formatMoneyNZD(product.basePrice)}
              </span>
              <span className="text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>ea</span>
            </div>
          </div>
        )}

        <span
          className="mt-auto pt-3 text-xs text-black/55 underline underline-offset-2 transition-opacity group-hover:opacity-50"
          style={{ letterSpacing: '-0.14px' }}
        >
          Customize →
        </span>
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
