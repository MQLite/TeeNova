import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo/metadata'
import {
  publishedServices,
  resolveService,
  serviceDraftPreviewAllowed,
  serviceHref,
} from './registry'

/**
 * Shared behaviour for `/services` and `/services/[slug]` (Jira 10306).
 *
 * One place decides "draft means 404 in production", mirroring the Jira 10303 arrangement so the
 * two content systems cannot drift into different answers.
 */

/** Only published slugs are pre-generated, so a Draft page is never emitted as a static route. */
export const publishedServiceParams = (): { slug: string }[] =>
  publishedServices().map((service) => ({ slug: service.slug }))

export const resolveServiceForRequest = (slug: string) =>
  resolveService(slug, { allowDraftPreview: serviceDraftPreviewAllowed() })

/**
 * Metadata for one service page.
 *
 * Title and description come from the service definition, so each of the eight pages is unique by
 * construction. The brand suffix, canonical, Open Graph shape and robots decision all come from the
 * shared builder (Jira 10308) rather than being written out here — this file used to carry its own
 * `openGraph` block with the brand name as a literal.
 *
 * A draft preview is reachable only outside production, and is marked `noindex, nofollow` anyway so
 * an accidentally exposed preview environment cannot be crawled. It also emits no structured data.
 */
export function serviceMetadata(slug: string): Metadata {
  const resolved = resolveServiceForRequest(slug)
  if (!resolved) return {}
  const { service, isDraftPreview } = resolved
  return buildPageMetadata({
    title: service.name,
    description: service.description,
    path: serviceHref(service),
    policy: isDraftPreview ? 'noindex-nofollow' : 'index',
  })
}
