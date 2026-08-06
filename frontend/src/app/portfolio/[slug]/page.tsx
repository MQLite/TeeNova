import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { portfolioApi, portfolioEnabled, type PortfolioItem } from '@/api/portfolio'
import { JsonLd } from '@/components/seo/JsonLd'
import { Icon } from '@/components/ui/Icon'
import { Section } from '@/components/ui/Layout'
import { resolveImageUrl } from '@/lib/image-utils'
import { buildPageMetadata, type SocialImage } from '@/lib/seo/metadata'
import { buildBreadcrumbList } from '@/lib/seo/structured-data/breadcrumb'
import { buildPortfolioWork, portfolioPath, serviceLabel } from '@/lib/seo/structured-data/portfolio'

/**
 * Portfolio item detail (Jira 10302, restyled in 10307, described in 10308).
 *
 * Image-first: the gallery is the page. Every image keeps the alt text stored
 * with it — alt text is required at the schema level, so there is no path here
 * that renders an image without one. No object keys, permission records or
 * internal references reach the public page, and none reach the structured data
 * either (see `structured-data/portfolio.ts`).
 */

/** One fetch, shared by `generateMetadata` and the page body — Next dedupes it per request. */
async function loadItem(slug: string): Promise<PortfolioItem | null> {
  if (!portfolioEnabled) return null
  return portfolioApi.get(slug).catch(() => null)
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const item = await loadItem(params.slug)
  if (!item) return {}

  const primary = item.images.find((image) => image.isPrimary) ?? item.images[0]
  const resolved = primary ? resolveImageUrl(primary.url) : null
  // Published portfolio media only, and only when the URL is absolute and publicly served. Anything
  // else falls back to the site default card.
  const image: SocialImage | undefined =
    resolved && /^https?:\/\//i.test(resolved)
      ? { url: resolved, alt: primary!.altText, width: primary!.width, height: primary!.height }
      : undefined

  return buildPageMetadata({
    title: item.title,
    description: item.shortCaption,
    path: portfolioPath(item.slug),
    policy: 'index',
    ogType: 'article',
    ...(image ? { images: [image] } : {}),
  })
}

export default async function PortfolioDetailPage({ params }: { params: { slug: string } }) {
  if (!portfolioEnabled) notFound()
  const item = await loadItem(params.slug)
  if (!item) notFound()

  const path = portfolioPath(item.slug)
  const graph = [
    // Matches the visible trail exactly: "Recent work / {title}".
    buildBreadcrumbList(path, [
      { name: 'Recent work', path: '/portfolio' },
      { name: item.title },
    ]),
    buildPortfolioWork(item, { indexable: true }),
  ]

  return (
    <Section spacing="tight">
      <JsonLd graph={graph} />
      <div className="content-measure">
        <nav aria-label="Breadcrumb" className="eyebrow mb-6 flex items-center gap-2">
          <Link href="/portfolio" className="transition-colors duration-fast hover:text-ink">
            Recent work
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="text-ink">
            {item.title}
          </span>
        </nav>
        <p className="eyebrow mb-3">{serviceLabel(item.serviceType)}</p>
        <h1 className="display-page">{item.title}</h1>
        <p className="mt-5 text-base leading-relaxed text-ink-secondary">{item.shortCaption}</p>
        {item.longDescription && (
          <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-ink-muted">
            {item.longDescription}
          </p>
        )}
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {item.images.map((image) => (
          <figure key={image.id} className="card overflow-hidden">
            <Image
              src={resolveImageUrl(image.url) ?? image.url}
              alt={image.altText}
              width={image.width}
              height={image.height}
              sizes="(max-width: 640px) 100vw, 50vw"
              className="h-auto w-full"
            />
          </figure>
        ))}
      </div>

      <div className="mt-10">
        <Link href="/portfolio" className="btn-text">
          <Icon name="arrow-right" className="h-4 w-4 rotate-180" />
          All recent work
        </Link>
      </div>
    </Section>
  )
}
