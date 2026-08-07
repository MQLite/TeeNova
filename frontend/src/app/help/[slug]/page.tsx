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

type SlugParams = { slug: string }

export function generateMetadata(props: { params: SlugParams }): Metadata
export function generateMetadata(props: { params: Promise<SlugParams> }): Promise<Metadata>
export function generateMetadata(props: { params: SlugParams | Promise<SlugParams> }): Metadata | Promise<Metadata> {
  return props.params instanceof Promise
    ? props.params.then((params) => contentMetadata('help', params.slug))
    : contentMetadata('help', props.params.slug)
}

function renderHelpContentPage(params: SlugParams) {
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

function HelpContentPage(props: { params: SlugParams }): ReturnType<typeof renderHelpContentPage>
function HelpContentPage(props: { params: Promise<SlugParams> }): Promise<ReturnType<typeof renderHelpContentPage>>
function HelpContentPage(props: { params: SlugParams | Promise<SlugParams> }) {
  return props.params instanceof Promise ? props.params.then(renderHelpContentPage) : renderHelpContentPage(props.params)
}

export default HelpContentPage
