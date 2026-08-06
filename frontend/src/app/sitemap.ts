import type { MetadataRoute } from 'next'
import { catalogApi } from '@/api/catalog'
import { portfolioApi, portfolioEnabled } from '@/api/portfolio'
import { publicContentHref, publishedDocuments } from '@/lib/public-content/registry'
import { publishedServices, serviceHref } from '@/lib/service-content/registry'
import { joinOrigin, siteOrigin } from '@/lib/seo/site-url'
import { quoteFormEnabled } from '@/lib/site-contact'

/**
 * `/sitemap.xml` (Jira 10308 Phases 9, 22, 23).
 *
 * ## Shape
 *
 * Two layers with different failure behaviour:
 *
 *   • **Static entries** are computed from compiled registries — the published-service registry, the
 *     published help/policy registry and the route table. They need no network call and are always
 *     present.
 *   • **Dynamic entries** (active products, published portfolio items) come from the public API.
 *     Each source is fetched independently inside its own `try`, so a catalogue outage costs the
 *     product URLs and nothing else. A backend failure never turns the sitemap into a 500 and never
 *     removes a static entry — a search engine reading an empty or erroring sitemap during a
 *     five-minute API blip is a worse outcome than a sitemap that is briefly short a few products.
 *
 * ## What is excluded
 *
 * Draft services, help documents, policies and portfolio items (they are 404s in production);
 * inactive products; `/admin`, `/api`, `/cart`, `/checkout`, `/orders`; the redirect-only
 * `/customize`; every query-string variant; and the error routes. Exclusion is by construction:
 * this file enumerates published registries rather than filtering a list of everything.
 *
 * ## `lastModified`
 *
 * Present only where a real recorded date exists — `lastReviewedAt` for a service or help document,
 * `publishedAt` for a portfolio item. It is deliberately **not** stamped with the build time: doing
 * that tells a crawler that every page changed at every deploy, which is false and trains it to
 * ignore the field. Products carry no public modification timestamp, so they carry no
 * `lastModified`.
 *
 * `changeFrequency` and `priority` are omitted entirely. Both are hints Google has said it ignores,
 * and the only honest value for either would be a guess.
 */

/** Revalidated hourly: the catalogue changes through Admin, not through a deploy. */
export const revalidate = 3600

/** Page size for the catalogue read. Matches the size the products page already uses. */
const PRODUCT_PAGE_SIZE = 100

/**
 * Safety bound on catalogue enumeration.
 *
 * The live catalogue is a single storefront's worth of products — the products page fetches 100 and
 * reports honestly if `totalCount` exceeds that — so 5,000 is far above any plausible size. It
 * exists to stop an unbounded loop if the API ever reports a `totalCount` it does not deliver, not
 * to trim a real catalogue. Hitting it is logged as an error rather than silently truncating.
 */
const MAX_PRODUCT_URLS = 5000
const MAX_PORTFOLIO_URLS = 2000
const PORTFOLIO_PAGE_SIZE = 100

type Entry = MetadataRoute.Sitemap[number]

/** ISO date (`YYYY-MM-DD`) → `Date`, or undefined when the value is not a real date. */
function asDate(value: string | undefined | null): Date | undefined {
  if (!value) return undefined
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

/** Log a sitemap problem without customer data, internal URLs or secrets. */
function logFailure(source: string, error: unknown): void {
  const reason = error instanceof Error ? error.name : 'unknown error'
  console.error(`[sitemap] ${source} unavailable (${reason}); static entries preserved.`)
}

function staticEntries(origin: string): Entry[] {
  const entries: Entry[] = [
    { url: joinOrigin(origin, '/') },
    { url: joinOrigin(origin, '/services') },
    { url: joinOrigin(origin, '/products') },
    { url: joinOrigin(origin, '/contact') },
  ]

  for (const service of publishedServices()) {
    entries.push({
      url: joinOrigin(origin, serviceHref(service)),
      lastModified: asDate(service.lastReviewedAt),
    })
  }

  for (const document of publishedDocuments()) {
    entries.push({
      url: joinOrigin(origin, publicContentHref(document)),
      lastModified: asDate(document.lastReviewedAt),
    })
  }

  // Both are listed only when the visitor would land on something worth indexing — matching the
  // route-indexing policy exactly, so a `noindex` route can never appear here.
  if (quoteFormEnabled) entries.push({ url: joinOrigin(origin, '/quote') })
  if (portfolioEnabled) entries.push({ url: joinOrigin(origin, '/portfolio') })

  return entries
}

async function productEntries(origin: string): Promise<Entry[]> {
  const seen = new Set<string>()
  const entries: Entry[] = []

  try {
    let skipCount = 0
    let totalCount = Number.POSITIVE_INFINITY

    while (entries.length < MAX_PRODUCT_URLS && skipCount < totalCount) {
      const page = await catalogApi.getProducts(
        { isActive: true, skipCount, maxResultCount: PRODUCT_PAGE_SIZE },
        { revalidate },
      )
      totalCount = page.totalCount
      if (page.items.length === 0) break

      for (const item of page.items) {
        // Anonymous callers already receive active products only (backend Jira 9808); re-checked
        // here so an API change cannot quietly publish an unlisted product.
        if (!item.isActive) continue
        const url = joinOrigin(origin, `/products/${item.id}`)
        if (seen.has(url)) continue
        seen.add(url)
        // No lastModified: the public catalogue exposes no modification timestamp, and the creation
        // time of a product is not when its page last changed.
        entries.push({ url })
      }

      skipCount += page.items.length
    }

    if (entries.length >= MAX_PRODUCT_URLS && skipCount < totalCount) {
      console.error(
        `[sitemap] product enumeration hit the ${MAX_PRODUCT_URLS}-URL safety bound with ${totalCount} reported; the sitemap is incomplete.`,
      )
    }
  } catch (error) {
    logFailure('catalogue', error)
  }

  return entries
}

async function portfolioEntries(origin: string): Promise<Entry[]> {
  if (!portfolioEnabled) return []

  const seen = new Set<string>()
  const entries: Entry[] = []

  try {
    let skipCount = 0
    let totalCount = Number.POSITIVE_INFINITY

    while (entries.length < MAX_PORTFOLIO_URLS && skipCount < totalCount) {
      const page = await portfolioApi.listPage(skipCount, PORTFOLIO_PAGE_SIZE)
      totalCount = page.totalCount
      if (page.items.length === 0) break

      for (const item of page.items) {
        // The anonymous list is Published-only server-side; re-checked so Draft or Archived work
        // cannot be advertised even if that ever changed.
        if (item.status !== 'Published') continue
        if (!item.slug) continue
        const url = joinOrigin(origin, `/portfolio/${item.slug}`)
        if (seen.has(url)) continue
        seen.add(url)
        entries.push({ url, lastModified: asDate(item.publishedAt) })
      }

      skipCount += page.items.length
    }

    if (entries.length >= MAX_PORTFOLIO_URLS && skipCount < totalCount) {
      console.error(
        `[sitemap] portfolio enumeration hit the ${MAX_PORTFOLIO_URLS}-URL safety bound; the sitemap is incomplete.`,
      )
    }
  } catch (error) {
    logFailure('portfolio', error)
  }

  return entries
}

/** Last line of defence against a duplicate URL reaching the XML. First entry wins. */
export function dedupe(entries: Entry[]): Entry[] {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    if (seen.has(entry.url)) return false
    seen.add(entry.url)
    return true
  })
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin()
  if (!origin) {
    // No approved canonical origin — the same fail-closed rule robots.txt applies. Publishing URLs
    // under a guessed origin would be worse than publishing none.
    console.error('[sitemap] no public site origin configured; sitemap is empty.')
    return []
  }

  const [products, portfolio] = await Promise.all([
    productEntries(origin),
    portfolioEntries(origin),
  ])

  return dedupe([...staticEntries(origin), ...products, ...portfolio])
}
