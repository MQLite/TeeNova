import { notFound, permanentRedirect } from 'next/navigation'
import { findService, isServicePublished, serviceHref } from '@/lib/service-content/registry'

/**
 * `/customize` resolution (Jira 10306).
 *
 * This route used to render a "Design Studio … coming soon" placeholder with a dashed
 * "Canvas Editor Placeholder" box, and the homepage and footer linked to it as **Bring Your Own
 * Garment**. That presented an unbuilt feature as a service a customer could use.
 *
 * The Design Studio is not built here, and the placeholder is not kept: the route now permanently
 * redirects to the real Bring Your Own Garment service page. The redirect target is resolved
 * through the publication gate rather than hard-coded, so if that service is ever unpublished the
 * route returns a real 404 instead of redirecting to one. The old public links are gone either way
 * — the homepage and footer are now derived from the published-service registry.
 */

const TARGET_SLUG = 'bring-your-own-garment'

/**
 * Rendered per request rather than prerendered. A `permanentRedirect` inside a statically generated
 * route is emitted as a 308 whose body carries the router payload but which has **no `Location`
 * header** — fine for in-app navigation, useless to a crawler or a plain HTTP client. Rendering on
 * demand makes it a real HTTP 308 with a `Location`. The route does no I/O, so the cost is nil.
 */
export const dynamic = 'force-dynamic'

/** Not indexable: this is a legacy path, and the service page is the canonical destination. */
export const metadata = { robots: { index: false, follow: false } }

export default function CustomizePage() {
  const target = findService(TARGET_SLUG)
  if (target && isServicePublished(target)) permanentRedirect(serviceHref(target))
  notFound()
}
