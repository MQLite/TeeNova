import Link from 'next/link'
import Image from 'next/image'
import { portfolioApi, portfolioEnabled, type PortfolioItem } from '@/api/portfolio'
import { resolveImageUrl } from '@/lib/image-utils'
import type { ServicePageDefinition } from '@/lib/service-content/types'

/**
 * Published portfolio work for a service page (Jira 10306).
 *
 * Consumes the Jira 10302 anonymous API, which serves Published items only. Items are filtered
 * again here by the service's stable classification, so a mismatched or ignored server-side filter
 * still cannot put another service's work on this page.
 *
 * With zero items — the state the site is actually in today, since no portfolio content has been
 * approved — this renders nothing: no heading, no placeholder tile, no "work coming soon". The page
 * must read as complete without it.
 */

const MAX_ITEMS = 3

export function selectServicePortfolio(
  service: ServicePageDefinition,
  items: PortfolioItem[],
): PortfolioItem[] {
  const expected = service.portfolioServiceType
  if (!expected) return []
  return items
    .filter((item) => item.status === 'Published')
    .filter((item) => item.serviceType === expected)
    .filter((item) => item.images.length > 0)
    .slice(0, MAX_ITEMS)
}

export async function ServicePortfolio({ service }: { service: ServicePageDefinition }) {
  if (!portfolioEnabled || !service.portfolioServiceType) return null

  const items = await portfolioApi
    .listByService(service.portfolioServiceType, MAX_ITEMS)
    .then((result) => selectServicePortfolio(service, result.items))
    .catch(() => [] as PortfolioItem[])

  if (items.length === 0) return null

  return (
    <section id="recent-work" tabIndex={-1} aria-labelledby="recent-work-heading" className="mt-14 scroll-mt-24">
      <div className="flex items-end justify-between gap-4">
        <h2 id="recent-work-heading" className="display-sub">
          Recent {service.shortName} work
        </h2>
        <Link href="/portfolio" className="text-sm underline underline-offset-4">
          View all work
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const image = item.images.find((candidate) => candidate.isPrimary) ?? item.images[0]
          return (
            <article key={item.id} className="card overflow-hidden">
              <Link href={`/portfolio/${item.slug}`} className="group block">
                {/* Fixed aspect ratio so the row does not reflow as images load. */}
                <div className="relative aspect-[4/3] overflow-hidden bg-surface-sunken">
                  <Image
                    src={resolveImageUrl(image.url) ?? image.url}
                    alt={image.altText}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                </div>
                <div className="p-5">
                  <h3 className="text-base text-ink font-semibold">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.shortCaption}</p>
                </div>
              </Link>
            </article>
          )
        })}
      </div>
    </section>
  )
}
