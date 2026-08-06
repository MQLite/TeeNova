import type { MetadataRoute } from 'next'
import { ROBOTS_DISALLOWED_PATHS } from '@/lib/seo/indexability'
import { isProductionBuild, siteOrigin } from '@/lib/seo/site-url'

/**
 * `/robots.txt` (Jira 10308 Phase 8).
 *
 * ## What is disallowed, and what deliberately is not
 *
 * Only `/admin/` and `/api/` are disallowed. Both are pure machine or operator surfaces — including
 * the private quote-attachment and log-download proxies under `/api/` — that no crawler has any use
 * for, and neither is linked from a public page.
 *
 * The cart, checkout and order routes are **not** disallowed, which is deliberate and is the
 * opposite of the obvious move. A disallowed URL is never fetched, so the `noindex` on it is never
 * read; and because the cart *is* linked from the site header, a crawler that cannot fetch it can
 * still index the bare URL from the link alone. Leaving those routes crawlable is what lets the
 * `noindex, nofollow` in their metadata actually take effect. None of this is access control: the
 * order route is protected by the backend's authorization rules, and would be equally protected if
 * this file did not exist.
 *
 * `/customize` is also left crawlable so the single 308 can be followed to its canonical target.
 *
 * Nothing that affects rendering is blocked: no CSS, no JavaScript, no `_next/` asset path, and no
 * product, service or portfolio image. Blocking those makes a page unrenderable to a crawler, which
 * is a far bigger problem than anything they might index.
 *
 * ## Fail-closed cases
 *
 * A site with no approved canonical origin, and any non-production deployment, returns a site-wide
 * `Disallow: /` with no `Sitemap:` line. Publishing a staging host's URLs, or publishing production
 * URLs signed with a staging origin, is worse than publishing nothing: both are hard to retract once
 * indexed. `NEXT_PUBLIC_SEO_INDEXING_ENABLED=false` forces the same behaviour on a deployment that
 * runs with `NODE_ENV=production` but is not the live site.
 */

/** Explicit opt-out for production-mode deployments that are not the live site. */
const indexingDisabled = (): boolean =>
  process.env.NEXT_PUBLIC_SEO_INDEXING_ENABLED?.trim().toLowerCase() === 'false'

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin()

  if (!origin || !isProductionBuild() || indexingDisabled()) {
    return { rules: { userAgent: '*', disallow: '/' } }
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [...ROBOTS_DISALLOWED_PATHS],
    },
    sitemap: `${origin}/sitemap.xml`,
  }
}
