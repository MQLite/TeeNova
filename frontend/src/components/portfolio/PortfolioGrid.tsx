import Link from 'next/link'
import Image from 'next/image'
import { CardGrid, Section, SectionHeading } from '@/components/ui/Layout'
import { resolveImageUrl } from '@/lib/image-utils'
import type { PortfolioItem } from '@/api/portfolio'

/**
 * Published portfolio grid (Jira 10302, restyled in 10307).
 *
 * Image-first: a fixed 4:3 frame on every card so a row cannot stagger when one
 * photo is portrait, and `object-cover` so no image is letterboxed. Alt text
 * comes from the item and is required by the schema — this component never
 * substitutes a placeholder string.
 *
 * Renders nothing when there is no published work; the empty state belongs to
 * the calling page, which knows whether "empty" means not-yet-approved
 * (`/portfolio`) or simply not-shown-here (the homepage).
 */
export function PortfolioGrid({ items, heading }: { items: PortfolioItem[]; heading?: string }) {
  if (items.length === 0) return null
  return (
    <Section aria-label={heading ?? 'Recent work'} divided={Boolean(heading)}>
      {heading && (
        <SectionHeading
          title={heading}
          className="mb-8"
          action={
            <Link href="/portfolio" className="btn-text">
              View all
            </Link>
          }
        />
      )}
      <CardGrid columns={3} className="gap-5">
        {items.map((item) => {
          const image = item.images.find((x) => x.isPrimary) ?? item.images[0]
          if (!image) return null
          return (
            <article key={item.id} className="card card-interactive overflow-hidden">
              <Link href={`/portfolio/${item.slug}`} className="group block h-full">
                <div className="relative aspect-[4/3] overflow-hidden bg-surface-sunken">
                  <Image
                    src={resolveImageUrl(image.url) ?? image.url}
                    alt={image.altText}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-slow group-hover:scale-[1.03]"
                  />
                </div>
                <div className="p-5">
                  <p className="eyebrow">{item.serviceType.replace(/([a-z])([A-Z])/g, '$1 $2')}</p>
                  <h3 className="mt-2 display-sub">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.shortCaption}</p>
                </div>
              </Link>
            </article>
          )
        })}
      </CardGrid>
    </Section>
  )
}
