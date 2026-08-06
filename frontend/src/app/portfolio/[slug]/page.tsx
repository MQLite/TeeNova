import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { portfolioApi, portfolioEnabled } from '@/api/portfolio'
import { Icon } from '@/components/ui/Icon'
import { Section } from '@/components/ui/Layout'
import { resolveImageUrl } from '@/lib/image-utils'

/**
 * Portfolio item detail (Jira 10302, restyled in 10307).
 *
 * Image-first: the gallery is the page. Every image keeps the alt text stored
 * with it — alt text is required at the schema level, so there is no path here
 * that renders an image without one. No object keys, permission records or
 * internal references reach the public page.
 */
export default async function PortfolioDetailPage({ params }: { params: { slug: string } }) {
  if (!portfolioEnabled) notFound()
  const item = await portfolioApi.get(params.slug).catch(() => null)
  if (!item) notFound()

  return (
    <Section spacing="tight">
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
        <p className="eyebrow mb-3">
          {item.serviceType.replace(/([a-z])([A-Z])/g, '$1 $2')}
        </p>
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
