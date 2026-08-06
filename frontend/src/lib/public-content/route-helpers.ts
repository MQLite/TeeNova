import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo/metadata'
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

/**
 * Metadata for one help or policy document.
 *
 * Titles and descriptions come from the document definition, so they are unique per document. The
 * canonical, Open Graph block and robots decision come from the shared builder (Jira 10308).
 *
 * A draft preview is reachable only outside production and is marked `noindex, nofollow` regardless,
 * so an accidentally exposed preview environment cannot be crawled. Draft wording never reaches a
 * description: an unpublished document resolves to `{}` in production and 404s.
 */
export function contentMetadata(group: PublicContentGroup, slug: string): Metadata {
  const resolved = resolveForRequest(group, slug)
  if (!resolved) return {}
  const { document, isDraftPreview } = resolved
  return buildPageMetadata({
    title: document.title,
    description: document.description,
    path: publicContentHref(document),
    policy: isDraftPreview ? 'noindex-nofollow' : 'index',
  })
}
