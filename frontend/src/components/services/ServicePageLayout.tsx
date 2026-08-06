import Link from 'next/link'
import { ContentBlockView } from '@/components/content/ContentBlocks'
import { publicContentHref } from '@/lib/public-content/registry'
import type { PublicContentDocument } from '@/lib/public-content/types'
import { serviceHref } from '@/lib/service-content/registry'
import type {
  ServiceFacts,
  ServiceFaqEntry,
  ServicePageDefinition,
  ServiceSectionDefinition,
} from '@/lib/service-content/types'
import { ServiceFactSections, serviceFactAnchors } from './ServiceFacts'

/**
 * Page furniture for a service page (Jira 10306).
 *
 * Server components throughout — a service page ships no client JavaScript of its own. The in-page
 * navigation is plain anchors, the FAQ is headings and text rather than a disclosure widget, and
 * content is always React children, so a definition module cannot inject markup.
 *
 * Exactly one `<h1>`; every section heading is an `<h2>`; FAQ questions are `<h3>` beneath the FAQ
 * `<h2>`, so no level is skipped.
 */

function formatReviewDate(value: string): string {
  return new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

export function ServiceBreadcrumb({ service }: { service: ServicePageDefinition }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <li>
          <Link href="/" className="underline underline-offset-2 hover:text-ink">
            Home
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <Link href="/services" className="underline underline-offset-2 hover:text-ink">
            Services
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <span aria-current="page" className="text-ink-secondary">
            {service.name}
          </span>
        </li>
      </ol>
    </nav>
  )
}

export function DraftServiceBanner({ service }: { service: ServicePageDefinition }) {
  return (
    <div
      role="note"
      aria-label="Draft service preview"
      className="mt-6 rounded-xl border-2 border-dashed border-ink bg-surface-sunken p-4"
    >
      <p className="eyebrow text-ink-secondary">Draft — not published</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        This service page is unapproved content shown only outside production. In production it
        returns a 404, and it is absent from the services index, the homepage and the footer.
      </p>
      {service.draftReason && (
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{service.draftReason}</p>
      )}
    </div>
  )
}

function ServiceSectionView({ section }: { section: ServiceSectionDefinition }) {
  return (
    // tabIndex -1 so keyboard focus follows an in-page anchor instead of staying at the top.
    <section id={section.id} tabIndex={-1} className="mt-10 scroll-mt-24">
      <h2 className="display-sub">
        {section.heading}
      </h2>
      {section.blocks.map((block, index) => (
        <ContentBlockView key={`${section.id}-${index}`} block={block} />
      ))}
    </section>
  )
}

function ServiceFaqView({ faqs }: { faqs: ServiceFaqEntry[] }) {
  if (faqs.length === 0) return null
  return (
    <section id="questions" tabIndex={-1} className="mt-10 scroll-mt-24">
      <h2 className="display-sub">
        Common questions
      </h2>
      <dl className="mt-4 space-y-6">
        {faqs.map((entry) => (
          <div key={entry.id} id={entry.id} className="scroll-mt-24">
            <dt>
              <h3 className="text-base text-ink font-semibold">
                {entry.question}
              </h3>
            </dt>
            <dd className="mt-2 text-base leading-relaxed text-ink-secondary">
              {entry.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function ServiceOnThisPage({
  anchors,
}: {
  anchors: { id: string; heading: string }[]
}) {
  if (anchors.length < 2) return null
  return (
    <nav aria-labelledby="on-this-page" className="mt-10 rounded-xl border border-line p-5">
      <h2 id="on-this-page" className="eyebrow text-ink-muted">
        On this page
      </h2>
      <ul className="mt-3 space-y-2">
        {anchors.map((anchor) => (
          <li key={anchor.id}>
            <a
              href={`#${anchor.id}`}
              className="text-sm text-ink-secondary underline underline-offset-2 hover:text-ink"
            >
              {anchor.heading}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function ServiceHelpLinks({ documents }: { documents: PublicContentDocument[] }) {
  if (documents.length === 0) return null
  return (
    <nav aria-labelledby="service-help" className="mt-14 border-t border-line pt-8">
      <h2 id="service-help" className="eyebrow text-ink-muted">
        Helpful pages
      </h2>
      <ul className="mt-3 space-y-2">
        {documents.map((document) => (
          <li key={`${document.group}/${document.slug}`}>
            <Link
              href={publicContentHref(document)}
              className="text-base text-ink-secondary underline underline-offset-2 hover:text-ink"
            >
              {document.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function OtherServicesLinks({
  services,
  current,
}: {
  services: ServicePageDefinition[]
  current: ServicePageDefinition
}) {
  const others = services.filter((service) => service.slug !== current.slug)
  if (others.length === 0) return null
  return (
    <nav aria-labelledby="other-services" className="mt-10 border-t border-line pt-8">
      <h2 id="other-services" className="eyebrow text-ink-muted">
        Other services
      </h2>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {others.map((service) => (
          <li key={service.slug}>
            <Link
              href={serviceHref(service)}
              className="text-sm text-ink-secondary underline underline-offset-2 hover:text-ink"
            >
              {service.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function ServiceIntro({
  service,
  sections,
  facts,
  faqs,
  isDraftPreview,
}: {
  service: ServicePageDefinition
  sections: ServiceSectionDefinition[]
  facts: ServiceFacts
  faqs: ServiceFaqEntry[]
  isDraftPreview: boolean
}) {
  const anchors = [
    ...sections.map((section) => ({ id: section.id, heading: section.heading })),
    ...serviceFactAnchors(facts),
    ...(faqs.length > 0 ? [{ id: 'questions', heading: 'Common questions' }] : []),
  ]

  return (
    <>
      <ServiceBreadcrumb service={service} />
      <p className="mt-6 eyebrow text-ink-muted">
        {service.hero.eyebrow}
      </p>
      <h1 className="display-section mt-3">{service.hero.headline}</h1>
      <p className="mt-4 text-base leading-relaxed text-ink-secondary">
        {service.hero.summary}
      </p>
      {isDraftPreview && <DraftServiceBanner service={service} />}
      <p className="mt-4 text-sm text-ink-muted">
        Last reviewed{' '}
        <time dateTime={service.lastReviewedAt}>{formatReviewDate(service.lastReviewedAt)}</time>
      </p>
      <ServiceOnThisPage anchors={anchors} />
      {sections.map((section) => (
        <ServiceSectionView key={section.id} section={section} />
      ))}
      <ServiceFactSections facts={facts} />
      <ServiceFaqView faqs={faqs} />
    </>
  )
}
