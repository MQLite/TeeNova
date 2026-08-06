/**
 * The complete set of public service pages (Jira 10306), plus the only lookups routes, navigation
 * and the homepage are allowed to use.
 *
 * `publishedServices()` is the single source of truth for "may appear anywhere public". The service
 * index, `generateStaticParams`, the homepage grid and the footer all derive from it, so a Draft
 * service cannot leak into navigation by being forgotten in a second hard-coded list — which is
 * precisely how `/customize` came to be advertised as a finished feature.
 */

import { bringYourOwnGarmentService } from '@/content/services/bring-your-own-garment'
import { businessCardsService } from '@/content/services/business-cards'
import { customGarmentPrintingService } from '@/content/services/custom-garment-printing'
import { customRoundButtonBadgesService } from '@/content/services/custom-round-button-badges'
import { pullUpBannersService } from '@/content/services/pull-up-banners'
import { pvcBannersService } from '@/content/services/pvc-banners'
import { signageService } from '@/content/services/signage'
import { stickersAndLabelsService } from '@/content/services/stickers-and-labels'
import { findDocument, isPublished as isDocumentPublished } from '@/lib/public-content/registry'
import type { PublicContentDocument } from '@/lib/public-content/types'
import type {
  ServiceFacts,
  ServiceFaqEntry,
  ServicePageDefinition,
  ServiceSectionDefinition,
} from './types'
import { evaluateServicePublication, renderableFacts } from './validation'

/** Declaration order is irrelevant; `sortOrder` is what the site renders by. */
export const allServices: readonly ServicePageDefinition[] = [
  customGarmentPrintingService,
  bringYourOwnGarmentService,
  customRoundButtonBadgesService,
  pvcBannersService,
  pullUpBannersService,
  businessCardsService,
  stickersAndLabelsService,
  signageService,
]

const bySortOrder = (a: ServicePageDefinition, b: ServicePageDefinition) =>
  a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug)

/** Every service, regardless of status. Only the approval report and tests should use this. */
export const findService = (slug: string): ServicePageDefinition | undefined =>
  allServices.find((service) => service.slug === slug)

export const isServicePublished = (service: ServicePageDefinition): boolean =>
  evaluateServicePublication(service).publishable

/** Services that may appear in navigation, the index, the homepage grid and generated routes. */
export const publishedServices = (): ServicePageDefinition[] =>
  [...allServices].filter(isServicePublished).sort(bySortOrder)

export const serviceHref = (service: { slug: string }): string => `/services/${service.slug}`

export interface RenderableService {
  service: ServicePageDefinition
  sections: ServiceSectionDefinition[]
  facts: ServiceFacts
  faqs: ServiceFaqEntry[]
  /** True when previewed outside production; the page must show a Draft banner and be noindex. */
  isDraftPreview: boolean
}

/**
 * Resolve a service for public rendering.
 *
 * In production a service that fails the gate resolves to `undefined`, so the route returns a real
 * 404. Outside production a Draft service resolves with `isDraftPreview` set and only the sections,
 * facts and FAQ entries that individually pass their own rules — a reviewer sees the shell, never
 * an unapproved price.
 */
export function resolveService(
  slug: string,
  options: { allowDraftPreview?: boolean } = {},
): RenderableService | undefined {
  const service = findService(slug)
  if (!service) return undefined

  const evaluation = evaluateServicePublication(service)
  if (evaluation.publishable) {
    return {
      service,
      sections: evaluation.sections,
      facts: evaluation.facts,
      faqs: evaluation.faqs,
      isDraftPreview: false,
    }
  }

  if (!options.allowDraftPreview) return undefined
  return {
    service,
    sections: service.sections.filter((section) => section.status === 'published'),
    facts: renderableFacts(service),
    faqs: service.faqs.filter((entry) => entry.status === 'published'),
    isDraftPreview: true,
  }
}

/** True only when the running build is a production build. */
export const serviceDraftPreviewAllowed = (): boolean => process.env.NODE_ENV !== 'production'

/** Help documents for a service, filtered to targets that are themselves published. */
export function publishedHelpLinks(service: ServicePageDefinition): PublicContentDocument[] {
  return (service.relatedHelpLinks ?? [])
    .map((link) => findDocument(link.group, link.slug))
    .filter((document): document is PublicContentDocument => Boolean(document))
    // Re-checked here rather than trusted from the gate, so navigation cannot outlive an approval
    // being withdrawn from a help document.
    .filter(isDocumentPublished)
}
