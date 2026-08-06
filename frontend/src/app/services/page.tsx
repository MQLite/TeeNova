import type { Metadata } from 'next'
import { ServiceCardGrid } from '@/components/services/ServiceCard'
import { QuoteLink } from '@/components/QuoteLink'
import { Section } from '@/components/ui/Layout'
import { EmptyState } from '@/components/ui/Notice'
import { PageHero } from '@/components/ui/PageHero'
import { publishedServices } from '@/lib/service-content/registry'

/**
 * Service index (Jira 10306).
 *
 * Server-rendered, published-only. The list comes from `publishedServices()`, the same function the
 * routes, the homepage grid and the footer use, so a Draft service cannot appear here — not even as
 * a title.
 */

export const metadata: Metadata = {
  title: 'Printing Services',
  description:
    'Garment printing, button badges, banners, business cards, stickers and signage from Otahuhu Printing Shop in Auckland. Order online where you can, or ask us for a quote.',
  alternates: { canonical: '/services' },
  openGraph: {
    title: 'Printing Services | Otahuhu Printing',
    description:
      'Garment printing, button badges, banners, business cards, stickers and signage from a local Otahuhu print shop.',
    type: 'website',
    locale: 'en_NZ',
    siteName: 'Otahuhu Printing Shop',
  },
}

export default function ServicesIndexPage() {
  const services = publishedServices()

  return (
    <>
      {/* Section-entry page: the black `inverse` hero treatment, not the homepage
          gradient. Four page types previously shared one identical rainbow band
          (Jira 10307 §Phase 13). */}
      <PageHero
        variant="inverse"
        align="center"
        eyebrow="Otahuhu, Auckland"
        title="Printing services"
        lead="What we print, how each job is ordered or quoted, and what we need from you to get started."
      />

      <Section>
        {/* The card titles are h3. Without this h2 the page jumps h1 → h3, which the layout
            matrix flagged as a heading-order break. It is visually hidden because the h1 above
            already reads "Printing services" — repeating it on screen would be noise. */}
        <h2 className="sr-only">All printing services</h2>
        {services.length > 0 ? (
          <ServiceCardGrid services={services} />
        ) : (
          <EmptyState
            variant="empty"
            icon="printer"
            as="h2"
            title="Service pages are not published yet"
            body="Get in touch and we can talk through what you need."
            actions={
              <QuoteLink source="/services" className="btn-black">
                Request a quote
              </QuoteLink>
            }
          />
        )}

        <div className="mt-12 rounded-xl border border-line bg-surface p-6 sm:mt-14 sm:p-8">
          <h2 className="display-sub">Not sure which one you need?</h2>
          <p className="mt-3 max-w-measure text-base leading-relaxed text-ink-secondary">
            Describe the job and we will work out the right approach with you. Getting in touch does
            not place an order and takes no payment.
          </p>
          <div className="mt-6">
            {/* Descriptive labels must wrap rather than force a horizontal scroll at 320px. The
                button system no longer sets `white-space: nowrap`, so this is now the default
                rather than a per-call-site override. */}
            <QuoteLink source="/services" className="btn-black">
              Request a quote for a print job
            </QuoteLink>
          </div>
        </div>
      </Section>
    </>
  )
}
