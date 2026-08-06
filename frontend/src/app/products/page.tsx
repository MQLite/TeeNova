import type { Metadata } from 'next'
import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { ProductCard } from '@/components/products/ProductCard'
import { QuoteLink } from '@/components/QuoteLink'
import { type IconName } from '@/components/ui/Icon'
import { ActionGroup, CardGrid, Section } from '@/components/ui/Layout'
import { EmptyState } from '@/components/ui/Notice'
import { PageHero } from '@/components/ui/PageHero'
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

// Shared empty/error box (Jira 9705), now the site-wide `EmptyState` primitive (Jira 10307) so a
// catalogue with nothing in it, a search that matched nothing and a backend outage read as three
// distinguishable states rather than three copies of one dashed box with a different emoji.
function EmptyBox({
  icon,
  title,
  body,
  variant,
  children,
}: {
  icon: IconName
  title: string
  body: string
  variant?: 'empty' | 'error'
  children?: React.ReactNode
}) {
  return (
    <EmptyState icon={icon} title={title} body={body} variant={variant ?? 'empty'} actions={children} />
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
      {/* Working page: the `plain` hero treatment keeps attention on the product
          images rather than on the chrome (Jira 10307 §Phase 5). */}
      <PageHero
        variant="plain"
        title="Products & Print Services"
        lead={
          <>
            Browse online products for garments, badges and banners, or request a quote for custom
            print jobs — printed locally in Otahuhu, Auckland.
            {!hasFetchError && (
              <span className="mono-sm ml-2 inline-block rounded-pill border border-line-strong px-2.5 py-0.5 align-middle text-ink-muted">
                {totalCount} product{totalCount !== 1 ? 's' : ''}
              </span>
            )}
          </>
        }
        above={
          <nav aria-label="Breadcrumb" className="eyebrow flex items-center gap-2">
            <Link href="/" className="transition-colors duration-fast hover:text-ink">
              Home
            </Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="text-ink">
              Products
            </span>
          </nav>
        }
      />

      {/* Grid */}
      <Section spacing="tight">
          {/* Product card titles are h3, so the page would otherwise jump h1 → h3. Hidden because
              the h1 above already names the list. */}
          <h2 className="sr-only">Product catalogue</h2>
          {/* Search (Jira 9705): plain GET form, no client JS. Keeps the selected category. */}
          <form action="/products" method="get" className="mb-6 flex w-full max-w-md items-center gap-2">
            {activeCategory.key !== 'all' && (
              <input type="hidden" name="category" value={activeCategory.key} />
            )}
            <label htmlFor="product-search" className="sr-only">
              Search products
            </label>
            <input
              id="product-search"
              type="search"
              name="search"
              defaultValue={params.search ?? ''}
              placeholder="Search products…"
              className="form-input rounded-pill"
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
                      ? 'border-ink bg-surface-inverse text-white'
                      : 'border-line-strong bg-white text-ink-muted hover:border-line-control hover:text-ink'
                  }`}
                >
                  {c.label} ({countByKey[c.key]})
                </Link>
              ))}
            </div>
            {!hasFetchError && (
              <p className="text-xs text-ink-muted">
                Showing <strong className="font-medium text-ink">{visible.length}</strong>
                {activeCategory.key === 'all'
                  ? ` of ${totalCount} products`
                  : ` ${CATEGORY_NOUNS[activeCategory.key]}`}
              </p>
            )}
          </div>

          {/* Quote-category explainer (Jira 9704) */}
          {activeCategory.key === 'quote' && (
            <p className="-mt-4 mb-8 text-sm text-ink-muted">
              These products are quoted individually — send us your requirements and we&apos;ll confirm pricing.
            </p>
          )}

          {hasFetchError ? (
            <EmptyBox
              icon="printer"
              variant="error"
              title="Products are temporarily unavailable"
              body="Please try again shortly or contact us for help with your print job."
            >
              <Link href="/contact" className="btn-black btn-sm">Contact Us</Link>
              <QuoteLink source="/products" className="btn-glass btn-sm">Request a Quote</QuoteLink>
            </EmptyBox>
          ) : items.length === 0 ? (
            params.search ? (
              <EmptyBox
                icon="search"
                title="No products matched your search"
                body="Try a different keyword or contact us for help with a custom print job."
              >
                <Link href={categoryHref(activeCategory.key)} className="btn-black btn-sm">Clear Search</Link>
                <Link href="/contact" className="btn-glass btn-sm">Contact Us</Link>
              </EmptyBox>
            ) : (
              <EmptyBox
                icon="package"
                title="No products are available online yet"
                body="Contact us and we can still help with custom printing."
              >
                <Link href="/contact" className="btn-black btn-sm">Contact Us</Link>
                <QuoteLink source="/products" className="btn-glass btn-sm">Request a Quote</QuoteLink>
              </EmptyBox>
            )
          ) : visible.length === 0 ? (
            <EmptyBox
              icon="search"
              title={CATEGORY_EMPTY[activeCategory.key].title}
              body={CATEGORY_EMPTY[activeCategory.key].body}
            >
              <Link href={categoryHref('all', params.search)} className="btn-black btn-sm">All Products</Link>
              <Link href="/contact" className="btn-glass btn-sm">Contact Us</Link>
              <QuoteLink source="/products" className="btn-glass btn-sm">Request a Quote</QuoteLink>
            </EmptyBox>
          ) : (
            <CardGrid columns={4}>
              {visible.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </CardGrid>
          )}
      </Section>

      {/* Bottom CTA */}
      <Section spacing="tight" divided className="text-center">
        <div className="mx-auto max-w-measure">
          <h2 className="display-sub mb-2">Can&apos;t find what you need?</h2>
          <p className="mb-6 text-sm text-ink-muted">
            Contact us for bulk orders, custom product types, or special requests.
          </p>
          <ActionGroup align="center">
            <QuoteLink source="/products" className="btn-black">Request a Quote</QuoteLink>
            <Link href="/" className="btn-glass">
              Back to Home
            </Link>
          </ActionGroup>
        </div>
      </Section>
    </>
  )
}
