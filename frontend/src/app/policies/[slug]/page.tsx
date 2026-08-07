import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ContentPageLayout } from '@/components/content/ContentPageLayout'
import { ContentStructuredData } from '@/components/content/ContentStructuredData'
import { publishedRelatedLinks } from '@/lib/public-content/registry'
import { contentMetadata, publishedParams, resolveForRequest } from '@/lib/public-content/route-helpers'

/**
 * Policy pages (Jira 10303). Server-rendered, published-only in production.
 *
 * Every policy document is currently Draft and awaiting owner and/or legal approval, so in a
 * production build every slug under this route returns 404. There is deliberately no index page:
 * listing policy titles would advertise unapproved documents.
 */

export function generateStaticParams() {
  return publishedParams('policies')
}

type SlugParams = { slug: string }

export function generateMetadata(props: { params: SlugParams }): Metadata
export function generateMetadata(props: { params: Promise<SlugParams> }): Promise<Metadata>
export function generateMetadata(props: { params: SlugParams | Promise<SlugParams> }): Metadata | Promise<Metadata> {
  return props.params instanceof Promise
    ? props.params.then((params) => contentMetadata('policies', params.slug))
    : contentMetadata('policies', props.params.slug)
}

function renderPolicyContentPage(params: SlugParams) {
  const resolved = resolveForRequest('policies', params.slug)
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

function PolicyContentPage(props: { params: SlugParams }): ReturnType<typeof renderPolicyContentPage>
function PolicyContentPage(props: { params: Promise<SlugParams> }): Promise<ReturnType<typeof renderPolicyContentPage>>
function PolicyContentPage(props: { params: SlugParams | Promise<SlugParams> }) {
  return props.params instanceof Promise ? props.params.then(renderPolicyContentPage) : renderPolicyContentPage(props.params)
}

export default PolicyContentPage
