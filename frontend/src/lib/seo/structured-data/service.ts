/**
 * `Service` (Jira 10308 Phase 12).
 *
 * Built from a published service definition and nothing else. The definition model (Jira 10306)
 * already tracks approval per *fact* rather than per page, and this builder reads only the two
 * fields that are safe by construction: the service name and the description that the page renders
 * as its own intro.
 *
 * Deliberately never emitted, whatever the definition contains:
 *
 *   • `offers` / `priceSpecification` — no published price range exists (A20), and a quote-only
 *     service has no price by definition.
 *   • `areaServed` — the service area is unresolved (A10). "We are in Otahuhu" is not "we serve
 *     all of Auckland".
 *   • `hoursAvailable`, `termsOfService`, `award`, `slogan` — no approved source.
 *   • `aggregateRating` / `review` — no verified review data exists anywhere (A28/A29).
 *
 * `provider` is a reference to the business entity, and is present only once that entity is itself
 * publishable. Naming an unapproved provider inline would smuggle the unresolved identity question
 * into every service page.
 */

import { serviceHref } from '@/lib/service-content/registry'
import type { ServicePageDefinition } from '@/lib/service-content/types'
import { absoluteUrl } from '../site-url'
import { serviceId } from './ids'
import { providerReference } from './organization'
import { compact, optionalText, type ServiceNode } from './types'

/**
 * Human-readable service category, used as `serviceType`.
 *
 * Derived from the definition's stable Jira 10301 quote classification (`GarmentPrinting`,
 * `PullUpBanners`, …) by spacing the words — a restatement of an existing enum value, not a new
 * commercial claim.
 */
export const serviceTypeLabel = (definition: ServicePageDefinition): string =>
  definition.quoteServiceType.replace(/([a-z])([A-Z])/g, '$1 $2')

export function buildService(
  definition: ServicePageDefinition,
  options: { indexable: boolean },
): ServiceNode | null {
  // A draft preview is `noindex` and shows only partially-approved content; it emits nothing.
  if (!options.indexable) return null

  const path = serviceHref(definition)
  const id = serviceId(path)
  const url = absoluteUrl(path)
  if (!id || !url) return null

  const name = optionalText(definition.name)
  const description = optionalText(definition.description)
  if (!name || !description) return null

  return compact<ServiceNode>({
    '@type': 'Service',
    '@id': id,
    name,
    description,
    url,
    serviceType: serviceTypeLabel(definition),
    provider: providerReference(),
    // `image` is omitted: no approved service photography exists (A32), and the portfolio images a
    // service page may show belong to the portfolio item, not to the service.
  })
}
