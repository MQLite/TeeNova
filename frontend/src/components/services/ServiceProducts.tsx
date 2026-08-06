import { catalogApi } from '@/api/catalog'
import { ProductCard } from '@/components/products/ProductCard'
import { PRODUCT_DETAIL_REVALIDATE_SECONDS } from '@/lib/catalog-cache'
import type { ProductListItem } from '@/types'
import type { ServicePageDefinition } from '@/lib/service-content/types'

/**
 * Catalogue products for a service page (Jira 10306).
 *
 * Rules this component exists to keep:
 *   • Only **active public** products appear — the anonymous list endpoint already restricts to
 *     active products, and `isActive: true` is sent as well.
 *   • Prices come from the existing `ProductCard`, which reads the same list DTO the `/products`
 *     grid does. No price is copied into service content and no price is recalculated here.
 *   • Nothing is fabricated: a service with no mapping and a service whose mapping resolves to zero
 *     products both render **nothing at all**, not an empty "Products" heading.
 *   • No configurator logic and no print-configuration request: the card links to the server
 *     rendered product page, which owns all of that.
 */

/** Bounded so a service page can never turn into an unpaginated catalogue dump. */
const MAX_PRODUCTS = 6

export function selectServiceProducts(
  service: ServicePageDefinition,
  products: ProductListItem[],
): ProductListItem[] {
  const ids = new Set((service.relatedProductIds ?? []).map((id) => id.toLowerCase()))
  const kinds = new Set(service.relatedProductKinds ?? [])
  if (ids.size === 0 && kinds.size === 0) return []

  return products
    .filter((product) => product.isActive)
    .filter((product) => ids.has(product.id.toLowerCase()) || kinds.has(product.kind))
    .slice(0, MAX_PRODUCTS)
}

export async function ServiceProducts({ service }: { service: ServicePageDefinition }) {
  if (!service.relatedProductIds?.length && !service.relatedProductKinds?.length) return null

  const products = await catalogApi
    .getProducts({ isActive: true, maxResultCount: 100 }, { revalidate: PRODUCT_DETAIL_REVALIDATE_SECONDS })
    .then((result) => selectServiceProducts(service, result.items))
    // A catalogue outage must not take the service page down or invent a product list.
    .catch(() => [] as ProductListItem[])

  if (products.length === 0) return null

  return (
    <section id="products" tabIndex={-1} aria-labelledby="products-heading" className="mt-14 scroll-mt-24">
      <h2 id="products-heading" className="display-sub">
        {service.relatedProductsHeading ?? 'Products in our catalogue'}
      </h2>
      {service.relatedProductsNote && (
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-secondary">
          {service.relatedProductsNote}
        </p>
      )}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}
