import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ServiceIntro, ServiceHelpLinks, OtherServicesLinks } from '@/components/services/ServicePageLayout'
import { ServicePortfolio } from '@/components/services/ServicePortfolio'
import { ServiceProducts } from '@/components/services/ServiceProducts'
import { ServiceQuoteCta } from '@/components/services/ServiceQuoteCta'
import { publishedHelpLinks, publishedServices, serviceHref } from '@/lib/service-content/registry'
import {
  publishedServiceParams,
  resolveServiceForRequest,
  serviceMetadata,
} from '@/lib/service-content/route-helpers'

/**
 * Service detail page (Jira 10306). Server-rendered, published-only in production.
 *
 * A draft or unknown slug is a real 404 in production. Outside production a draft renders behind a
 * Draft banner with `noindex, nofollow` metadata and only the sections and facts that individually
 * pass the gate, so a reviewer never sees an unapproved price dressed up as a published one.
 *
 * The product and portfolio children are async server components rendered inside the same tree, so
 * a catalogue or portfolio outage degrades to "section absent" rather than failing the page.
 */

export function generateStaticParams() {
  return publishedServiceParams()
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  return serviceMetadata(params.slug)
}

export default function ServiceDetailPage({ params }: { params: { slug: string } }) {
  const resolved = resolveServiceForRequest(params.slug)
  if (!resolved) notFound()

  const { service, sections, facts, faqs, isDraftPreview } = resolved
  const sourcePath = serviceHref(service)

  return (
    // No `<main>` here: the root layout owns the single `main` landmark. Nesting a second one
    // (Jira 10307) gave assistive technology two main regions on every service page.
    <div className="section-container py-10 sm:py-14">
      {/* The content measure keeps the reading column near 70 characters; the product and portfolio
          grids below deliberately sit outside it so cards are not squeezed into a text column. */}
      <div className="content-measure">
        <ServiceIntro
          service={service}
          sections={sections}
          facts={facts}
          faqs={faqs}
          isDraftPreview={isDraftPreview}
        />
        <ServiceQuoteCta
          serviceType={service.quoteServiceType}
          shortName={service.shortName}
          sourcePath={sourcePath}
        />
      </div>

      <div className="mx-auto max-w-measure-wide">
        <ServiceProducts service={service} />
        <ServicePortfolio service={service} />
      </div>

      <div className="content-measure">
        <ServiceHelpLinks documents={publishedHelpLinks(service)} />
        <OtherServicesLinks services={publishedServices()} current={service} />
      </div>
    </div>
  )
}
