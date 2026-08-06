import Link from 'next/link'
import { resolveImageUrl } from '@/lib/image-utils'
import { formatMoneyNZD } from '@/lib/pricing'
import type { ProductKind, ProductListItem } from '@/types'

interface ProductCardProps {
  product: ProductListItem
}

// Card chip derived from kind first (Jira 9703): the free-text productType defaults to "tshirt"
// even for Badge/Banner products, so it is only trusted as a garment subtype label.
function categoryLabel(product: ProductListItem): string {
  switch (product.kind) {
    case 'Garment':
      return product.productType?.trim() || 'Garment'
    case 'Badge':
      return 'Badge'
    case 'Banner':
      return 'Banner'
    case 'Other':
      return 'Quote'
    default:
      return 'Product'
  }
}

// Non-garment listing summary (Jira 9704). ProductListItem carries no badge tiers or banner
// fixed-size option prices, and basePrice on non-garment products is a placeholder — so these
// cards state how the product is priced instead of showing a number. Real prices live on the
// detail page, which computes them from the authoritative per-kind data.
function summaryCopy(product: ProductListItem): { primary: string; secondary: string } {
  switch (product.kind) {
    case 'Badge':
      return { primary: 'Volume pricing', secondary: 'Priced by quantity on the product page' }
    case 'Banner':
      switch (product.pricingModel) {
        case 'FixedSize':
          return { primary: 'Standard sizes', secondary: 'Priced online by size and quantity' }
        case 'CustomQuoteOnly':
          return { primary: 'Custom quote', secondary: 'Send your banner size and artwork for pricing' }
        default: // AreaBased is not priceable online.
          return { primary: 'Contact for quote', secondary: 'This banner option is quoted by the shop' }
      }
    default: // Other / unknown quote-like products.
      return { primary: 'Contact for quote', secondary: 'Tell us what you need and we’ll confirm pricing' }
  }
}

// CTA wording by kind/pricingModel (Jira 9703). The card always links to /products/[id]; the
// detail page dispatches to the matching flow (garment config, badge, banner order, or enquiry).
function ctaLabel(product: ProductListItem): string {
  switch (product.kind) {
    case 'Garment':
      return 'Customize →'
    case 'Badge':
      return 'View badge →'
    case 'Banner':
      switch (product.pricingModel) {
        case 'FixedSize':
          return 'View banner →'
        case 'CustomQuoteOnly':
          return 'Request quote →'
        default: // AreaBased is not priceable online — the detail page shows contact-for-quote.
          return 'Contact for quote →'
      }
    default:
      return 'Contact for quote →'
  }
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
      <div className="relative aspect-square overflow-hidden bg-surface-sunken">
        {resolveImageUrl(product.primaryImageUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveImageUrl(product.primaryImageUrl)!}
            alt={product.name}
            className="h-full w-full object-contain p-6 transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <CardPlaceholder kind={product.kind} />
          </div>
        )}

        {/* Category badge (kind-derived, Jira 9703) */}
        <div className="absolute left-3 top-3">
          <span className="font-mono rounded-full border border-line bg-white/90 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.54px] text-ink-muted backdrop-blur-sm">
            {categoryLabel(product)}
          </span>
        </div>
      </div>

      {/* Info — mirrors the product-detail hero card (Jira 9303). */}
      <div className="flex flex-1 flex-col border-t border-line px-4 py-4">
        <h3
          className="text-sm text-ink line-clamp-1"
          style={{ fontWeight: 500 }}
        >
          {product.name}
        </h3>

        {product.kind !== 'Garment' ? (
          // Per-kind quote/pricing summary (Jira 9704) — non-garment cards never show the raw
          // basePrice fallback or garment wording.
          <div className="mt-3">
            <p className="text-lg text-ink font-medium">
              {summaryCopy(product).primary}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {summaryCopy(product).secondary}
            </p>
          </div>
        ) : hero ? (
          <div className="mt-3">
            <p className="eyebrow text-ink-muted">
              Garment + print · from
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-3xl text-ink">
                {formatMoneyNZD(hero.price)}
              </span>
              <span className="text-xs text-ink-muted">ea</span>
            </div>
            <p className="mt-0.5 text-xs text-ink font-medium">
              for {hero.printSizeName} printing + garment
            </p>
            <p className="mt-0.5 eyebrow text-ink-muted">
              {quantityCopy}
            </p>
            <p className="mt-2 eyebrow text-ink-muted">
              Garment {garmentLabel} ea{hero.sizeAdjustments.length > 0 ? ' · varies by size' : ''}
            </p>
            {hero.sizeAdjustments.length > 0 && (
              <p className="mt-0.5 eyebrow text-ink-muted">
                {hero.sizeAdjustments.map((a) => `${a.size}: +$${a.adjustment.toFixed(2)}`).join(' | ')}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3">
            {/* Defensive (Jira 9704): a garment with no printed-from price and a zero/unset
                basePrice would otherwise render "$0.00 ea" — defer to the detail page instead. */}
            {!showPrinted && product.basePrice <= 0 ? (
              <p className="text-sm text-ink-muted">
                See product for pricing
              </p>
            ) : (
              <>
                <p className="eyebrow text-ink-muted">
                  {showPrinted ? 'Garment + print · from' : 'Garment price'}
                </p>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="text-3xl text-ink">
                    {showPrinted ? formatMoneyNZD(product.fromPrice!) : formatMoneyNZD(product.basePrice)}
                  </span>
                  <span className="text-xs text-ink-muted">ea</span>
                </div>
              </>
            )}
          </div>
        )}

        <span
          className="mt-auto pt-3 text-xs text-ink-muted underline underline-offset-2 transition-opacity group-hover:opacity-50"
        >
          {ctaLabel(product)}
        </span>
      </div>
    </Link>
  )
}

// Fallback art when a product has no image (Jira 9703): garment keeps the T-shirt silhouette;
// other kinds get a simple neutral shape so a Badge/Banner never previews as a T-shirt.
function CardPlaceholder({ kind }: { kind: ProductKind }) {
  switch (kind) {
    case 'Badge':
      return <BadgePlaceholder />
    case 'Banner':
      return <BannerPlaceholder />
    case 'Garment':
      return <TShirtPlaceholder />
    default:
      return <DocumentPlaceholder />
  }
}

function TShirtPlaceholder() {
  return (
    <svg viewBox="0 0 200 220" className="h-28 w-28 text-black/[0.06]" fill="currentColor">
      <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
    </svg>
  )
}

function BadgePlaceholder() {
  return (
    <svg viewBox="0 0 200 220" className="h-28 w-28 text-black/[0.06]" fill="currentColor">
      {/* Round pin badge: outer disc with a contrasting inner ring cut out */}
      <path
        fillRule="evenodd"
        d="M 100 30 A 80 80 0 1 0 100 190 A 80 80 0 1 0 100 30 Z M 100 55 A 55 55 0 1 1 100 165 A 55 55 0 1 1 100 55 Z"
      />
      <circle cx="100" cy="110" r="38" />
    </svg>
  )
}

function BannerPlaceholder() {
  return (
    <svg viewBox="0 0 200 220" className="h-28 w-28 text-black/[0.06]" fill="currentColor">
      {/* Pull-up banner: tall panel on a base with a foot */}
      <rect x="55" y="25" width="90" height="140" rx="6" />
      <rect x="45" y="175" width="110" height="14" rx="7" />
      <rect x="94" y="165" width="12" height="12" />
    </svg>
  )
}

function DocumentPlaceholder() {
  return (
    <svg viewBox="0 0 200 220" className="h-28 w-28 text-black/[0.06]" fill="currentColor">
      {/* Print/document sheet with text lines */}
      <path
        fillRule="evenodd"
        d="M 55 25 L 125 25 L 155 55 L 155 195 L 55 195 Z M 70 90 L 140 90 L 140 100 L 70 100 Z M 70 115 L 140 115 L 140 125 L 70 125 Z M 70 140 L 120 140 L 120 150 L 70 150 Z"
      />
    </svg>
  )
}
