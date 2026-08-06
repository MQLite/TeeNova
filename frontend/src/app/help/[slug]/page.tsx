import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ContentPageLayout } from '@/components/content/ContentPageLayout'
import { ContentStructuredData } from '@/components/content/ContentStructuredData'
import { publishedRelatedLinks } from '@/lib/public-content/registry'
import { contentMetadata, publishedParams, resolveForRequest } from '@/lib/public-content/route-helpers'

/**
 * Customer help pages (Jira 10303). Server-rendered, published-only in production.
 *
 * A draft or unknown slug is a real 404 in production; outside production a draft renders behind a
 * Draft banner so reviewers can see the shell without unapproved wording being presented as final.
 */

export function generateStaticParams() {
  return publishedParams('help')
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  return contentMetadata('help', params.slug)
}

export default function HelpContentPage({ params }: { params: { slug: string } }) {
  const resolved = resolveForRequest('help', params.slug)
  if (!resolved) notFound()

  return (
    <>
      <ContentStructuredData
        document={resolved.document}
        sections={resolved.sections}
        isDraftPreview={resolved.isDraftPreview}
      />
      <ContentPageLayout
        document={resolved.document}
        sections={resolved.sections}
        isDraftPreview={resolved.isDraftPreview}
        related={publishedRelatedLinks(resolved.document)}
      />
    </>
  )
}
