import type { Metadata } from 'next'
import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { ProductCard } from '@/components/products/ProductCard'
import type { ProductListItem } from '@/types'

interface PageProps {
  searchParams: Promise<{ search?: string; category?: string }>
}

// Category chips filter on ProductKind/PricingModel (Jira 9702) — never on the free-text
// productType tag, which defaults to "tshirt" even for Badge/Banner products. "Quote / Enquire"
// deliberately overlaps "Banners": chips are views, not partitions, and it also catches
// kind === 'Other' products so nothing is reachable only via "All".
const CATEGORIES = [
  {
    key: 'all',
    label: 'All',
    matches: (_p: ProductListItem) => true,
  },
  {
    key: 'garments',
    label: 'T-Shirts & Garments',
    matches: (p: ProductListItem) => p.kind === 'Garment',
  },
  {
    key: 'badges',
    label: 'Badges',
    matches: (p: ProductListItem) => p.kind === 'Badge',
  },
  {
    key: 'banners',
    label: 'Banners',
    matches: (p: ProductListItem) => p.kind === 'Banner',
  },
  {
    key: 'quote',
    label: 'Quote / Enquire',
    matches: (p: ProductListItem) =>
      p.pricingModel === 'CustomQuoteOnly' || p.pricingModel === 'AreaBased',
  },
] as const

type Category = (typeof CATEGORIES)[number]

// Category-aware SEO metadata (Jira 9706). Titles are template-suffixed by the root layout
// ("%s | Otahuhu Printing"); OpenGraph titles carry the full string because OG ignores the template.
// Like the root layout, OG stays image-less and URL-less until an OG asset / canonical domain exists.
const CATEGORY_META: Record<Category['key'], { title: string; description: string }> = {
  all: {
    title: 'Products & Print Services',
    description:
      'Browse T-shirt printing, badges, banners and custom print services from Otahuhu Printing Shop in Auckland. Order online or contact us for a quote.',
  },
  garments: {
    title: 'T-Shirt & Garment Printing',
    description:
      'Browse T-shirt, hoodie and garment printing options from Otahuhu Printing Shop in Auckland.',
  },
  badges: {
    title: 'Custom Badges',
    description:
      'Browse custom badge printing options for events, schools, teams and branding from Otahuhu Printing Shop in Auckland.',
  },
  banners: {
    title: 'Banners & Pull-Ups',
    description:
      'Browse banner and pull-up printing options from Otahuhu Printing Shop in Auckland, including online ordering and quote-based banner services.',
  },
  quote: {
    title: 'Quote-Based Print Services',
    description:
      'View print services that are quoted individually and contact Otahuhu Printing Shop in Auckland for pricing.',
  },
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams
  // Same fallback rule as the page body: unknown/missing ?category= reads as All.
  const key: Category['key'] = CATEGORIES.some((c) => c.key === params.category)
    ? (params.category as Category['key'])
    : 'all'
  const meta = CATEGORY_META[key]
  return {
    title: meta.title,
    description: meta.description,
    openGraph: {
      title: `${meta.title} | Otahuhu Printing`,
      description:
        key === 'all'
          ? 'Explore garments, badges, banners and quote-based print services from a local Otahuhu print shop.'
          : meta.description,
      type: 'website',
      locale: 'en_NZ',
      siteName: 'Otahuhu Printing Shop',
    },
  }
}

// "Showing N …" copy per category. Kept separate from label to read naturally in a sentence.
const CATEGORY_NOUNS: Record<Category['key'], string> = {
  all: 'products',
  garments: 'garment products',
  badges: 'badge products',
  banners: 'banner products',
  quote: 'quote/enquiry products',
}

// Category-specific empty copy (Jira 9705). `all` is unused here — an empty All view is the
// whole-catalog empty state, which has its own copy below.
const CATEGORY_EMPTY: Record<Category['key'], { title: string; body: string }> = {
  all: { title: 'No products are available online yet', body: 'Contact us and we can still help with custom printing.' },
  garments: { title: 'No garment products are available online yet', body: 'Contact us and we can help with custom garment printing.' },
  badges: { title: 'No badge products are available online yet', body: 'Contact us and we can help with custom badge printing.' },
  banners: { title: 'No banner products are available online yet', body: 'Contact us and we can help with custom banners and signage.' },
  quote: { title: 'No quote-only products are listed yet', body: 'Send us your requirements and we’ll confirm pricing.' },
}

// Shared dashed empty/error box (Jira 9705) so all four states render consistently.
function EmptyBox({
  icon,
  title,
  body,
  children,
}: {
  icon: string
  title: string
  body: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-black/[0.12] py-24 text-center">
      <span className="text-4xl">{icon}</span>
      <h3 className="mt-4 text-base text-black" style={{ fontWeight: 480, letterSpacing: '-0.26px' }}>
        {title}
      </h3>
      <p className="mt-1 max-w-md text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
        {body}
      </p>
      {children && <div className="mt-5 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  )
}

function categoryHref(key: Category['key'], search?: string) {
  const params = new URLSearchParams()
  if (key !== 'all') params.set('category', key)
  if (search) params.set('search', search)
  const qs = params.toString()
  return qs ? `/products?${qs}` : '/products'
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams

  // One active-only fetch sized for client-side category filtering (Jira 9702). Categories are
  // filtered over this single set, so it must be large enough to hold the whole storefront catalog;
  // if totalCount ever exceeds it, the "Showing X of Y" copy stays honest about the truncation.
  const maxResultCount = 100

  let items: ProductListItem[] = []
  let totalCount = 0
  let hasFetchError = false
  try {
    const result = await catalogApi.getProducts({
      search: params.search,
      isActive: true,
      skipCount: 0,
      maxResultCount,
    })
    items = result.items
    totalCount = result.totalCount
  } catch {
    // Backend unavailable — render the error state instead of a misleading "no products" (Jira 9705).
    hasFetchError = true
  }

  // Unknown/missing ?category= falls back to All (never errors).
  const activeCategory =
    CATEGORIES.find((c) => c.key === params.category) ?? CATEGORIES[0]
  const visible = items.filter(activeCategory.matches)
  const countByKey = Object.fromEntries(
    CATEGORIES.map((c) => [c.key, items.filter(c.matches).length]),
  ) as Record<Category['key'], number>

  return (
    <>
      {/* Page header */}
      <section className="border-b border-black/[0.08] py-14">
        <div className="section-container">
          <nav className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
            <Link href="/" className="hover:text-black transition-colors">Home</Link>
            <span className="opacity-40">›</span>
            <span className="text-black">Products</span>
          </nav>
          <h1 className="display-section mb-4">Products &amp; Print Services</h1>
          <p className="text-base text-black/50" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
            Browse online products for garments, badges and banners, or request a quote for custom
            print jobs — printed locally in Otahuhu, Auckland.
            {!hasFetchError && (
              <span className="ml-2 rounded-full border border-black/[0.08] px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
                {totalCount} product{totalCount !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
      </section>

      {/* Grid */}
      <section className="py-12">
        <div className="section-container">

          {/* Search (Jira 9705): plain GET form, no client JS. Keeps the selected category. */}
          <form action="/products" method="get" className="mb-6 flex w-full max-w-md items-center gap-2">
            {activeCategory.key !== 'all' && (
              <input type="hidden" name="category" value={activeCategory.key} />
            )}
            <input
              type="search"
              name="search"
              defaultValue={params.search ?? ''}
              placeholder="Search products…"
              className="w-full rounded-[50px] border border-black/[0.12] bg-white px-4 py-1.5 text-sm text-black outline-none transition-colors placeholder:text-black/40 focus:border-black"
              style={{ letterSpacing: '-0.14px' }}
            />
            <button type="submit" className="btn-black btn-sm shrink-0">
              Search
            </button>
            {params.search && (
              <Link href={categoryHref(activeCategory.key)} className="btn-glass btn-sm shrink-0">
                Clear
              </Link>
            )}
          </form>

          {/* Filter bar — chips scroll horizontally on small screens, wrap from sm up (Jira 9705). */}
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
              {CATEGORIES.map((c) => (
                <Link
                  key={c.key}
                  href={categoryHref(c.key, params.search)}
                  className={`shrink-0 whitespace-nowrap rounded-[50px] border px-4 py-1.5 text-sm transition-colors ${
                    c.key === activeCategory.key
                      ? 'border-black bg-black text-white'
                      : 'border-black/[0.12] bg-white text-black/50 hover:border-black/30 hover:text-black'
                  }`}
                  style={{ letterSpacing: '-0.14px' }}
                >
                  {c.label} ({countByKey[c.key]})
                </Link>
              ))}
            </div>
            {!hasFetchError && (
              <p className="text-xs text-black/55" style={{ letterSpacing: '0.02em' }}>
                Showing <strong className="font-medium text-black">{visible.length}</strong>
                {activeCategory.key === 'all'
                  ? ` of ${totalCount} products`
                  : ` ${CATEGORY_NOUNS[activeCategory.key]}`}
              </p>
            )}
          </div>

          {/* Quote-category explainer (Jira 9704) */}
          {activeCategory.key === 'quote' && (
            <p className="-mt-4 mb-8 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
              These products are quoted individually — send us your requirements and we&apos;ll confirm pricing.
            </p>
          )}

          {hasFetchError ? (
            <EmptyBox
              icon="🖨️"
              title="Products are temporarily unavailable"
              body="Please try again shortly or contact us for help with your print job."
            >
              <Link href="/contact" className="btn-black btn-sm">Contact Us</Link>
              <a href="mailto:otahuhuprint@gmail.com" className="btn-glass btn-sm">Request a Quote</a>
            </EmptyBox>
          ) : items.length === 0 ? (
            params.search ? (
              <EmptyBox
                icon="🔍"
                title="No products matched your search"
                body="Try a different keyword or contact us for help with a custom print job."
              >
                <Link href={categoryHref(activeCategory.key)} className="btn-black btn-sm">Clear Search</Link>
                <Link href="/contact" className="btn-glass btn-sm">Contact Us</Link>
              </EmptyBox>
            ) : (
              <EmptyBox
                icon="📦"
                title="No products are available online yet"
                body="Contact us and we can still help with custom printing."
              >
                <Link href="/contact" className="btn-black btn-sm">Contact Us</Link>
                <a href="mailto:otahuhuprint@gmail.com" className="btn-glass btn-sm">Request a Quote</a>
              </EmptyBox>
            )
          ) : visible.length === 0 ? (
            <EmptyBox
              icon="🔍"
              title={CATEGORY_EMPTY[activeCategory.key].title}
              body={CATEGORY_EMPTY[activeCategory.key].body}
            >
              <Link href={categoryHref('all', params.search)} className="btn-black btn-sm">All Products</Link>
              <Link href="/contact" className="btn-glass btn-sm">Contact Us</Link>
              <a href="mailto:otahuhuprint@gmail.com" className="btn-glass btn-sm">Request a Quote</a>
            </EmptyBox>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-black/[0.08] py-16 text-center">
        <div className="section-container max-w-lg">
          <h2
            className="mb-2 text-xl text-black"
            style={{ fontWeight: 540, letterSpacing: '-0.26px' }}
          >
            Can&apos;t find what you need?
          </h2>
          <p className="mb-6 text-sm text-black/50" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
            Contact us for bulk orders, custom product types, or special requests.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href="mailto:otahuhuprint@gmail.com" className="btn-black">
              Contact Us
            </a>
            <Link href="/" className="btn-glass">
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
