/**
 * The complete set of public policy and help documents (Jira 10303), plus the only lookups routes
 * and navigation are allowed to use.
 *
 * `publishedDocuments` is the single source of truth for "may appear anywhere public": routes,
 * footer links, related links and static params all derive from it, so a Draft document cannot leak
 * into navigation, a sitemap or a generated route by being forgotten in a second list.
 */

import { artworkRequirementsDocument } from '@/content/help/artwork-requirements'
import { deliveryAndPickupDocument } from '@/content/help/delivery-and-pickup'
import { faqDocument } from '@/content/help/faq'
import { garmentCareDocument } from '@/content/help/garment-care'
import { sizeGuideDocument } from '@/content/help/size-guide'
import { turnaroundDocument } from '@/content/help/turnaround'
import { paymentTermsDocument } from '@/content/policies/payment-terms'
import { privacyDocument } from '@/content/policies/privacy'
import { returnsDocument } from '@/content/policies/returns'
import { termsDocument } from '@/content/policies/terms'
import type { PublicContentDocument, PublicContentGroup, PublicContentSection } from './types'
import { evaluatePublication } from './validation'

export const helpDocuments: readonly PublicContentDocument[] = [
  artworkRequirementsDocument,
  turnaroundDocument,
  deliveryAndPickupDocument,
  faqDocument,
  sizeGuideDocument,
  garmentCareDocument,
]

export const policyDocuments: readonly PublicContentDocument[] = [
  privacyDocument,
  returnsDocument,
  paymentTermsDocument,
  termsDocument,
]

export const allPublicContentDocuments: readonly PublicContentDocument[] = [
  ...helpDocuments,
  ...policyDocuments,
]

export const documentsInGroup = (group: PublicContentGroup): readonly PublicContentDocument[] =>
  group === 'help' ? helpDocuments : policyDocuments

/** Every document, regardless of status. Only the approval report and tests should use this. */
export const findDocument = (
  group: PublicContentGroup,
  slug: string,
): PublicContentDocument | undefined =>
  documentsInGroup(group).find((document) => document.slug === slug)

export interface RenderablePublicDocument {
  document: PublicContentDocument
  /** Sections safe to render for this audience. */
  sections: PublicContentSection[]
  /** True when the document is being previewed outside production and must show a Draft banner. */
  isDraftPreview: boolean
}

/**
 * Resolve a document for public rendering.
 *
 * In production a document that fails the publication gate resolves to `undefined`, so the route
 * returns a real 404. Outside production a Draft document resolves with `isDraftPreview` set and
 * only its published sections, so reviewers can see the page shell without unapproved wording being
 * dressed up as final policy.
 */
export function resolvePublicDocument(
  group: PublicContentGroup,
  slug: string,
  options: { allowDraftPreview?: boolean } = {},
): RenderablePublicDocument | undefined {
  const document = findDocument(group, slug)
  if (!document) return undefined

  const evaluation = evaluatePublication(document)
  if (evaluation.publishable) {
    return { document, sections: evaluation.publishedSections, isDraftPreview: false }
  }

  if (!options.allowDraftPreview) return undefined
  return {
    document,
    sections: document.sections.filter((section) => section.status === 'published'),
    isDraftPreview: true,
  }
}

/** True only when the running build is a production build. */
export const draftPreviewAllowed = (): boolean => process.env.NODE_ENV !== 'production'

export const isPublished = (document: PublicContentDocument): boolean =>
  evaluatePublication(document).publishable

/** Documents that may appear in navigation, related links and generated routes. */
export const publishedDocuments = (
  group?: PublicContentGroup,
): readonly PublicContentDocument[] =>
  (group ? documentsInGroup(group) : allPublicContentDocuments).filter(isPublished)

export const publicContentHref = (document: {
  group: PublicContentGroup
  slug: string
}): string => `/${document.group}/${document.slug}`

/** Related links, filtered to published targets so a Draft route is never linked. */
export function publishedRelatedLinks(
  document: PublicContentDocument,
): PublicContentDocument[] {
  return (document.related ?? [])
    .map((link) => findDocument(link.group, link.slug))
    .filter((target): target is PublicContentDocument =>
      Boolean(target) && target !== document && isPublished(target!))
}
