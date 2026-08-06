import type { Metadata } from 'next'
import {
  draftPreviewAllowed,
  publicContentHref,
  publishedDocuments,
  resolvePublicDocument,
} from './registry'
import type { PublicContentGroup } from './types'

/**
 * Shared behaviour for the `/help/[slug]` and `/policies/[slug]` routes (Jira 10303).
 *
 * Both routes are server-rendered and both delegate the publication decision here, so there is one
 * place where "draft means 404 in production" is decided.
 */

/** Only published slugs are pre-generated, so a Draft page is never emitted as a static route. */
export const publishedParams = (group: PublicContentGroup): { slug: string }[] =>
  publishedDocuments(group).map((document) => ({ slug: document.slug }))

export const resolveForRequest = (group: PublicContentGroup, slug: string) =>
  resolvePublicDocument(group, slug, { allowDraftPreview: draftPreviewAllowed() })

export function contentMetadata(group: PublicContentGroup, slug: string): Metadata {
  const resolved = resolveForRequest(group, slug)
  if (!resolved) return {}
  const { document, isDraftPreview } = resolved
  return {
    title: document.title,
    description: document.description,
    alternates: { canonical: publicContentHref(document) },
    // A draft preview is only reachable outside production, but it is marked non-indexable anyway
    // so an accidentally exposed preview environment cannot be crawled.
    ...(isDraftPreview ? { robots: { index: false, follow: false } } : {}),
  }
}
