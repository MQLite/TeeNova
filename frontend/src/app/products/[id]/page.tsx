import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { catalogApi } from '@/api/catalog'
import { BadgeProductDetail } from '@/components/products/BadgeProductDetail'
import { BannerProductDetail } from '@/components/products/BannerProductDetail'
import { FixedSizeBannerProductDetail } from '@/components/products/FixedSizeBannerProductDetail'
import { ApiError } from '@/lib/api-client'
import { PRODUCT_DETAIL_REVALIDATE_SECONDS } from '@/lib/catalog-cache'
import type { Product } from '@/types'
import { GarmentConfigurationSection } from './GarmentConfigurationSection'
import { ProductDetailSkeleton } from './ProductDetailSkeleton'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Server-rendered product shell (Jira 10304).
 *
 * Before this task the whole route was `'use client'`: the document contained no product markup, the
 * id was only known after hydration, and three browser requests (product, global print areas, global
 * print sizes) all had to finish before anything but a spinner was drawn. Any one of them failing
 * rendered "Product not found".
 *
 * Now the initial data is fetched here, on the server, and handed to the interactive island as
 * props. The island is still server-rendered, so the product name, image, reference price and
 * description are in the HTML document; hydration only attaches behaviour and issues **no** repeat
 * of these three requests.
 *
 * Failure handling is split at the source:
 *   • 404 from the backend (missing product, or an inactive one for an anonymous visitor — the
 *     anonymous redaction rule from Jira 9808 is untouched and still enforced server-side) →
 *     `notFound()` → `not-found.tsx`, a real 404 response.
 *   • anything else (network, 5xx, timeout) → rethrown → `error.tsx`, which offers a working Retry.
 *
 * Server-side fetches go through the shared API client, which prefers the server-only `BACKEND_URL`
 * (see `lib/api-client.ts`), so the internal backend address is never exposed to the browser.
 */

/** True when the failure means "this product does not exist / is not publicly visible". */
function isMissingProduct(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

async function loadProduct(id: string): Promise<Product> {
  try {
    return await catalogApi.getProduct(id, { revalidate: PRODUCT_DETAIL_REVALIDATE_SECONDS })
  } catch (error) {
    if (isMissingProduct(error)) notFound()
    // Transient/backend failure — surfaces as the retryable route error, never as "not found".
    throw error
  }
}

/** Server-owned breadcrumb, rendered before the configurator streams in. */
function Breadcrumb({ productName }: { productName: string }) {
  return (
    <div className="border-b border-line bg-surface">
      <div className="section-container py-3">
        <nav aria-label="Breadcrumb" className="eyebrow flex flex-wrap items-center gap-1.5">
          <Link href="/" className="transition-colors duration-fast hover:text-ink">Home</Link>
          <span aria-hidden="true">/</span>
          <Link href="/products" className="transition-colors duration-fast hover:text-ink">Products</Link>
          <span aria-hidden="true">/</span>
          {/* Long product names wrap here rather than pushing the row sideways at 320px. */}
          <span aria-current="page" className="min-w-0 break-words text-ink">{productName}</span>
        </nav>
      </div>
    </div>
  )
}

/** Trims a product description into a metadata-safe single-line summary. */
function summarize(description: string | null, limit = 155): string | null {
  if (!description) return null
  const flattened = description.replace(/\s+/g, ' ').trim()
  if (flattened === '') return null
  if (flattened.length <= limit) return flattened
  return `${flattened.slice(0, limit - 1).trimEnd()}…`
}

/** Neutral, verifiable fallback copy for a product with no description. States no unapproved fact. */
function fallbackDescription(product: Product): string {
  switch (product.kind) {
    case 'Badge':
      return `${product.name} — custom badge printing from Otahuhu Printing Shop in Auckland. Configure your order online.`
    case 'Banner':
      return `${product.name} — banner printing from Otahuhu Printing Shop in Auckland. Configure your order or request a quote online.`
    default:
      return `${product.name} — custom printing from Otahuhu Printing Shop in Auckland. Choose your options and see pricing online.`
  }
}

/**
 * Product-specific metadata (Jira 10304).
 *
 * This task supplies only the *capability* the client-only route could not have: a real per-product
 * title and description. Content decisions, structured data, sitemap, robots, review markup, Offer
 * data and SEO slugs stay with Jira 10308. `alternates.canonical` is a route-relative path, which
 * becomes an absolute canonical automatically once 10308 sets `metadataBase`; OpenGraph deliberately
 * stays image-less and URL-less, matching the root layout.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params

  let product: Product
  try {
    product = await catalogApi.getProduct(id, { revalidate: PRODUCT_DETAIL_REVALIDATE_SECONDS })
  } catch {
    // Metadata must never break the page: a missing or unreachable product falls back to generic
    // copy, and the page body itself resolves 404 vs. retryable error.
    return { title: 'Product' }
  }

  const description = summarize(product.description) ?? fallbackDescription(product)

  return {
    title: product.name,
    description,
    alternates: { canonical: `/products/${product.id}` },
    openGraph: {
      title: `${product.name} | Otahuhu Printing`,
      description,
      type: 'website',
      locale: 'en_NZ',
      siteName: 'Otahuhu Printing Shop',
    },
  }
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params
  // Awaited before anything is rendered: this is what decides 404 vs. 200 for the document.
  const product = await loadProduct(id)

  // Dispatch by product kind (Jira 9504), unchanged from the client route it replaces — only the
  // place it happens moved. Badge has its own storefront UX (quantity-tier unit pricing, item-level
  // design) with no variant/print controls. Each branch renders its own breadcrumb and hero content.
  if (product.kind === 'Badge') {
    return <BadgeProductDetail product={product} />
  }

  // Banner dispatch by pricing model (Jira 9512/9517). CustomQuoteOnly = enquiry-first (no live price,
  // no cart); FixedSize = automatically priced from preset size options (live quote + cart + checkout);
  // AreaBased is not implemented yet — show a request-a-quote message rather than a broken price flow.
  if (product.kind === 'Banner') {
    if (product.pricingModel === 'FixedSize') {
      return <FixedSizeBannerProductDetail product={product} />
    }
    if (product.pricingModel === 'CustomQuoteOnly') {
      return <BannerProductDetail product={product} />
    }
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="display-sub">{product.name}</h1>
        <p className="max-w-measure text-sm text-ink-muted">
          This banner isn’t available to price online yet. Please contact the shop for a quote.
        </p>
        <Link href="/products" className="btn-glass btn-sm">Back to Products</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Breadcrumb productName={product.name} />
      <Suspense fallback={<ProductDetailSkeleton />}>
        <GarmentConfigurationSection product={product} />
      </Suspense>
    </div>
  )
}
