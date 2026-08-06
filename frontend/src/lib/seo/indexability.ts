/**
 * The route-indexing policy (Jira 10308 Phase 3).
 *
 * One table, consumed by three things that would otherwise drift: the per-route `robots` metadata,
 * the sitemap, and the tests that assert a transactional route can never become indexable. The
 * table is also the source of the indexability inventory in the evidence document.
 *
 * ## What a policy is and is not
 *
 * `noindex` is a *discovery* control. It is not access control and is not a privacy measure: an
 * order page is protected by the backend's authorization rules, and would be just as protected if
 * this file did not exist. The reason `/orders/[id]` is `noindex, nofollow` is that a
 * customer-specific reference has no business appearing in a search index, not that indexing is how
 * it would leak.
 *
 * For the same reason the transactional family is deliberately **not** blocked in `robots.txt`: a
 * disallowed URL cannot be crawled, so the `noindex` on it is never read, and a URL that is linked
 * from the site header (the cart is) can then be indexed URL-only. Letting the crawler fetch the
 * page and read the directive is what actually keeps it out.
 */

export type IndexPolicy = 'index' | 'noindex-follow' | 'noindex-nofollow'

export interface RobotsDirective {
  index: boolean
  follow: boolean
  googleBot?: { index: boolean; follow: boolean }
}

export function robotsDirective(policy: IndexPolicy): RobotsDirective {
  switch (policy) {
    case 'index':
      return { index: true, follow: true }
    case 'noindex-follow':
      // Still followed: the fallback pages carry real links to /contact and /services, and dropping
      // that link equity for a temporarily thin page helps nobody.
      return { index: false, follow: true }
    case 'noindex-nofollow':
      return { index: false, follow: false }
  }
}

export type RouteCategory =
  | 'public-content'
  | 'catalogue'
  | 'conversion'
  | 'transactional'
  | 'authenticated'
  | 'operational'
  | 'redirect'
  | 'error'

export interface RoutePolicyEntry {
  /** Route pattern as it appears in `app/`. */
  route: string
  category: RouteCategory
  /** A fixed decision, or the two-branch decision a feature flag selects between. */
  policy: IndexPolicy | { enabled: IndexPolicy; disabled: IndexPolicy; flag: string }
  /** `true`/`false`, or the condition under which the route is listed. */
  sitemap: boolean | string
  note: string
}

/** The decision a route settles on, resolving a feature-flag branch with `enabled`. */
export const resolvePolicy = (entry: RoutePolicyEntry, enabled = true): IndexPolicy =>
  typeof entry.policy === 'string' ? entry.policy : enabled ? entry.policy.enabled : entry.policy.disabled

/**
 * Every public-facing route and its final decision.
 *
 * Conditions ("published only", "feature enabled") are enforced in code at the point of use; the
 * table records the intent so a reviewer can check the two against each other.
 */
export const ROUTE_POLICY: readonly RoutePolicyEntry[] = [
  {
    route: '/',
    category: 'public-content',
    policy: 'index',
    sitemap: true,
    note: 'Homepage. Permanent content independent of catalogue availability.',
  },
  {
    route: '/services',
    category: 'public-content',
    policy: 'index',
    sitemap: true,
    note: 'Service index, rendered from the published-service registry.',
  },
  {
    route: '/services/[slug]',
    category: 'public-content',
    policy: 'index',
    sitemap: 'published services only',
    note: 'Draft services are a real 404 in production and are never pre-generated.',
  },
  {
    route: '/products',
    category: 'catalogue',
    policy: 'index',
    sitemap: true,
    note: 'Search and category query variants canonicalize to /products; only the bare path is listed.',
  },
  {
    route: '/products/[id]',
    category: 'catalogue',
    policy: 'index',
    sitemap: 'active public products only',
    note: 'GUID URLs; the catalogue exposes no public slug. Inactive products 404 for anonymous callers.',
  },
  {
    route: '/products/[id] (not found)',
    category: 'error',
    policy: 'noindex-nofollow',
    sitemap: false,
    note: 'Real HTTP 404. A temporary backend failure routes to error.tsx instead, so an outage never produces a not-found signal.',
  },
  {
    route: '/portfolio',
    category: 'public-content',
    policy: {
      enabled: 'index',
      disabled: 'noindex-follow',
      flag: 'NEXT_PUBLIC_PORTFOLIO_ENABLED',
    },
    sitemap: 'feature enabled',
    note: 'With the feature off the page is an operational notice with nothing to index.',
  },
  {
    route: '/portfolio/[slug]',
    category: 'public-content',
    policy: 'index',
    sitemap: 'published portfolio items only',
    note: '404 when the feature is off or the item is not Published.',
  },
  {
    route: '/quote',
    category: 'conversion',
    policy: {
      enabled: 'index',
      disabled: 'noindex-follow',
      flag: 'NEXT_PUBLIC_QUOTE_FORM_ENABLED',
    },
    sitemap: 'quote form enabled',
    note: 'The feature-off fallback is a short "email us instead" page — useful to a visitor who lands on it, too thin to be worth indexing.',
  },
  {
    route: '/contact',
    category: 'conversion',
    policy: 'index',
    sitemap: true,
    note: 'Location and contact details.',
  },
  {
    route: '/help/[slug]',
    category: 'public-content',
    policy: 'index',
    sitemap: 'published help documents only',
    note: 'Two published today (artwork requirements, FAQ); the rest are Draft and 404 in production.',
  },
  {
    route: '/policies/[slug]',
    category: 'public-content',
    policy: 'index',
    sitemap: 'published policies only',
    note: 'Every policy is Draft, so the route currently 404s for every slug and contributes no sitemap entry.',
  },
  {
    route: '/customize',
    category: 'redirect',
    policy: 'noindex-nofollow',
    sitemap: false,
    note: 'Single 308 to the published Bring Your Own Garment service page. Redirect-only URLs are not canonical targets.',
  },
  {
    route: '/cart',
    category: 'transactional',
    policy: 'noindex-nofollow',
    sitemap: false,
    note: 'Per-visitor state.',
  },
  {
    route: '/checkout',
    category: 'transactional',
    policy: 'noindex-nofollow',
    sitemap: false,
    note: 'Per-visitor state; payment flow.',
  },
  {
    route: '/checkout/success',
    category: 'transactional',
    policy: 'noindex-nofollow',
    sitemap: false,
    note: 'Carries an order reference.',
  },
  {
    route: '/checkout/cancel',
    category: 'transactional',
    policy: 'noindex-nofollow',
    sitemap: false,
    note: 'Carries an order reference.',
  },
  {
    route: '/orders/[id]',
    category: 'transactional',
    policy: 'noindex-nofollow',
    sitemap: false,
    note: 'Customer-specific order detail.',
  },
  {
    route: '/admin/**',
    category: 'authenticated',
    policy: 'noindex-nofollow',
    sitemap: false,
    note: 'Authorization is the security boundary; noindex and the robots disallow are hygiene, not protection.',
  },
  {
    route: '/api/**',
    category: 'operational',
    policy: 'noindex-nofollow',
    sitemap: false,
    note: 'Route handlers, including the private attachment and log-download proxies. Disallowed in robots.txt.',
  },
  {
    route: '(404)',
    category: 'error',
    policy: 'noindex-nofollow',
    sitemap: false,
    note: 'Real HTTP 404 with recovery links; no canonical and no structured data.',
  },
] as const

/** Paths disallowed in `robots.txt`. Kept narrow — see the note at the top of this file. */
export const ROBOTS_DISALLOWED_PATHS = ['/admin/', '/api/'] as const

/** Route prefixes that must never be indexable, asserted in tests. */
export const NEVER_INDEXABLE_PREFIXES = [
  '/admin',
  '/api',
  '/cart',
  '/checkout',
  '/orders',
] as const
