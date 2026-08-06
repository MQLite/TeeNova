import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { CardGrid } from '@/components/ui/Layout'
import { serviceHref } from '@/lib/service-content/registry'
import type { ServicePageDefinition } from '@/lib/service-content/types'

/**
 * One published service, as a card (Jira 10306, restyled in 10307).
 *
 * Shared by `/services` and the homepage grid so the two cannot describe the same service
 * differently. The whole card is one link whose accessible name starts with the service title, and
 * the CTA text names the service too — there are no repeated bare "Learn more" links.
 *
 * The illustration is a member of the shared icon family rather than an emoji: it inherits the
 * card's text colour, renders identically on every platform, and is `aria-hidden`, so the visible
 * title remains the only label. Card height is equalised by `flex-1` on the summary so a grid row
 * does not stagger when one summary is a line longer.
 */
export function ServiceCard({ service }: { service: ServicePageDefinition }) {
  return (
    <Link
      href={serviceHref(service)}
      className="group card card-interactive flex flex-col p-5 sm:p-6"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-sunken text-ink transition-colors duration-brand group-hover:bg-action group-hover:text-action-ink">
        <Icon name={service.iconName} className="h-5 w-5" />
      </span>
      <h3 className="mt-4 display-sub">{service.name}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">{service.cardSummary}</p>
      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-ink">
        {`View ${service.shortName}`}
        <Icon
          name="arrow-right"
          className="h-4 w-4 transition-transform duration-brand group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  )
}

export function ServiceCardGrid({ services }: { services: ServicePageDefinition[] }) {
  if (services.length === 0) return null
  return (
    <CardGrid columns={3}>
      {services.map((service) => (
        <ServiceCard key={service.slug} service={service} />
      ))}
    </CardGrid>
  )
}
