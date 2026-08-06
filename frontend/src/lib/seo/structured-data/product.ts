/**
 * `Product` and its offer (Jira 10308 Phase 13).
 *
 * Built entirely from the public catalogue payload the page already renders. Nothing is derived,
 * inferred or filled in.
 *
 * ## Fields deliberately absent
 *
 * `sku` — the catalogue has no public SKU. Variants carry an internal SKU that is never shown to a
 * customer, and the product's GUID is a database key, not a stock-keeping unit the business quotes
 * over the phone. Publishing either would invent a public identifier.
 *
 * `brand` — the products are blank garments, badge blanks and banner media that the shop prints on.
 * Naming the shop as the product's brand would assert a manufacturer relationship that does not
 * exist, and no manufacturer is recorded in the catalogue.
 *
 * `availability` — `isActive` means "publicly listed", not "physically in stock". The two are
 * genuinely different: a listed product with no stock is normal for a print shop that orders
 * blanks per job. Mapping one to `InStock` would be a fabricated stock claim, so no availability is
 * emitted at all. There is no configuration flag for this; it would need a real availability field
 * on the catalogue.
 *
 * `priceValidUntil`, `shippingDetails`, `hasMerchantReturnPolicy` — no approved price-validity
 * window exists, the delivery policy is Draft (Jira 10303) and the returns policy is Draft and
 * awaiting legal review (A21). Each would be a published commercial term the business has not
 * agreed.
 *
 * `aggregateRating`, `review` — no verified review source exists (A28/A29).
 *
 * ## Offer eligibility
 *
 * An offer is emitted only where the catalogue holds explicit, publicly displayed NZ$ unit prices
 * with a defined meaning:
 *
 *   • **Badge** — the active quantity ladder. The page shows "From $x" and a table of per-unit
 *     prices by quantity; `lowPrice`/`highPrice` are the ends of that same table.
 *   • **Banner (FixedSize)** — the active size options. The page shows "From $x" and a per-size
 *     unit price; the offer spans the same set.
 *
 * and omitted everywhere else:
 *
 *   • **Garment** — the visible figure is a *reference* price ("Garment + print · from $x ea",
 *     "Reference price for N pieces", "Your exact price updates below"). It depends on print size,
 *     position, colour and quantity, and the page says so. There is no single number that means
 *     "this product costs this much", and reproducing the reference calculation here would also
 *     duplicate pricing logic that is deliberately server-authoritative.
 *   • **Banner (CustomQuoteOnly / AreaBased)** and **Other** — priced by quote; no public amount.
 *
 * `AggregateOffer` rather than `Offer` is the point: it is the schema.org shape that says "prices
 * in this range", which is what the page actually says.
 */

import { isOptimizableImageUrl, resolveImageUrl, sortImages } from '@/lib/image-utils'
import type { Product } from '@/types'
import { absoluteUrl } from '../site-url'
import { productId as productNodeId } from './ids'
import {
  compact,
  optionalList,
  optionalText,
  type AggregateOfferNode,
  type ProductNode,
} from './types'

export const productPath = (id: string): string => `/products/${id}`

/** Readable category from the catalogue's business kind. `Other` has no meaningful public label. */
function categoryLabel(product: Product): string | undefined {
  switch (product.kind) {
    case 'Garment':
      return 'Garment printing'
    case 'Badge':
      return 'Button badges'
    case 'Banner':
      return 'Banners'
    default:
      return undefined
  }
}

/**
 * Publicly served catalogue image URLs.
 *
 * `isOptimizableImageUrl` is reused as the "is this a public catalogue image" test because it is
 * exactly that check: same origin as the public API base, under `/uploads/products/`. Customer
 * design artwork lives under `/uploads/designs/` and is excluded by the same rule, so private
 * artwork cannot reach the graph even if an image row pointed at it.
 */
function publicImageUrls(product: Product): string[] {
  return sortImages(product.images)
    .map((image) => resolveImageUrl(image.url))
    .filter((url): url is string => Boolean(url) && isOptimizableImageUrl(url))
}

const isFinitePositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * The publicly displayed unit prices for a product, or an empty list when it has none with a clear
 * meaning. See the header comment for why garments and quote-only banners return nothing.
 */
export function publicUnitPrices(product: Product): number[] {
  if (!product.isActive) return []

  if (product.kind === 'Badge') {
    return product.quantityPriceTiers
      .filter((tier) => tier.isActive)
      .map((tier) => tier.unitPrice)
      .filter(isFinitePositive)
  }

  if (product.kind === 'Banner' && product.pricingModel === 'FixedSize') {
    return product.fixedSizePriceOptions
      .filter((option) => option.isActive)
      .map((option) => option.unitPrice)
      .filter(isFinitePositive)
  }

  return []
}

/** `AggregateOffer` when — and only when — real public prices support one. */
export function buildOffer(product: Product): AggregateOfferNode | null {
  const url = absoluteUrl(productPath(product.id))
  if (!url) return null

  const prices = publicUnitPrices(product)
  if (prices.length === 0) return null

  const lowPrice = Math.min(...prices)
  const highPrice = Math.max(...prices)
  if (!isFinitePositive(lowPrice) || !isFinitePositive(highPrice)) return null

  return compact<AggregateOfferNode>({
    '@type': 'AggregateOffer',
    // The whole catalogue is priced in New Zealand dollars — `formatMoneyNZD` is the only money
    // formatter in the frontend and the backend quotes NZD.
    priceCurrency: 'NZD',
    lowPrice,
    highPrice: highPrice !== lowPrice ? highPrice : undefined,
    offerCount: prices.length,
    url,
  })
}

/**
 * `Product` for an active, publicly visible product.
 *
 * Returns `null` for an inactive product and whenever the origin is unavailable. The caller only
 * reaches this function after the product has been successfully loaded, so a backend outage never
 * produces a node — the route's error boundary runs instead and renders no structured data at all.
 */
export function buildProduct(product: Product): ProductNode | null {
  if (!product.isActive) return null

  const path = productPath(product.id)
  const id = productNodeId(path)
  const url = absoluteUrl(path)
  if (!id || !url) return null

  const name = optionalText(product.name)
  if (!name) return null

  const offers = buildOffer(product)

  return compact<ProductNode>({
    '@type': 'Product',
    '@id': id,
    name,
    url,
    // Only the catalogue's own description. The metadata layer has a neutral fallback sentence for
    // products with no description; that is page copy, not a catalogue fact, and is not repeated
    // here as though the shop had written it about this product.
    description: optionalText(product.description),
    image: optionalList(publicImageUrls(product)),
    category: categoryLabel(product),
    ...(offers ? { offers } : {}),
  })
}
