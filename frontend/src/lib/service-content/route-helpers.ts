import type { Metadata } from 'next'
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

export function serviceMetadata(slug: string): Metadata {
  const resolved = resolveServiceForRequest(slug)
  if (!resolved) return {}
  const { service, isDraftPreview } = resolved
  return {
    title: service.name,
    description: service.description,
    alternates: { canonical: serviceHref(service) },
    openGraph: {
      title: `${service.name} | Otahuhu Printing`,
      description: service.description,
      type: 'website',
      locale: 'en_NZ',
      siteName: 'Otahuhu Printing Shop',
    },
    // A draft preview is only reachable outside production, but it is marked non-indexable anyway
    // so an accidentally exposed preview environment cannot be crawled.
    ...(isDraftPreview ? { robots: { index: false, follow: false } } : {}),
  }
}
