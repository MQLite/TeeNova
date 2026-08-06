import { QuoteLink } from '@/components/QuoteLink'
import { quoteFormEnabled } from '@/lib/site-contact'
import { SERVICE_OPTIONS } from '@/app/quote/quote-form-validation'
import type { QuoteServiceType } from '@/types'

/**
 * Service-specific quote call to action (Jira 10306).
 *
 * There is exactly one general enquiry path on this site — Jira 10301's `/quote` — and this
 * component routes to it through the same centralised `QuoteLink`/`quoteHref` helper every other
 * CTA uses. No second enquiry endpoint, no service-specific form, no bespoke mailto construction.
 *
 * The only context that travels in the query string is the service slug, an optional product GUID
 * and the page the customer came from. No customer data, no price, no storage token and no internal
 * key: the backend resolves the product name itself from the GUID.
 */

/**
 * A descriptive label ("Request a quote for custom garment printing") must wrap rather than become
 * an unshrinkable ~326px box that pushes the page sideways at a 320px viewport.
 *
 * Jira 10306 achieved that with a per-call-site override, because `.btn-black` then set
 * `white-space: nowrap`. Jira 10307 removed `nowrap` from the shared button geometry — wrapping is
 * now the default for every button on the site, and `max-w-full` is part of `.btn-*` itself. The
 * constant stays so this file still names the requirement it is protecting; the `text-center`
 * class is what a wrapped multi-line label needs.
 */
const CTA_CLASS = 'btn-black text-center'

const quoteSlug = (service: QuoteServiceType): string =>
  SERVICE_OPTIONS.find((option) => option.value === service)?.slug ?? 'other'

export function ServiceQuoteCta({
  serviceType,
  shortName,
  sourcePath,
  productId,
  variant = 'panel',
}: {
  serviceType: QuoteServiceType
  shortName: string
  sourcePath: string
  productId?: string
  variant?: 'panel' | 'inline'
}) {
  const label = `Request a quote for ${shortName}`

  if (variant === 'inline') {
    return (
      <QuoteLink
        service={quoteSlug(serviceType)}
        product={productId}
        source={sourcePath}
        className={CTA_CLASS}
      >
        {label}
      </QuoteLink>
    )
  }

  return (
    <section
      aria-labelledby="request-a-quote"
      className="mt-14 rounded-2xl border border-line bg-surface-sunken p-6 sm:p-8"
    >
      <h2 id="request-a-quote" className="display-sub">
        Ask us about your job
      </h2>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-secondary">
        {quoteFormEnabled
          ? 'Send us the details and we will come back to you with a price. Sending a request does not place an order and takes no payment.'
          : 'Send us the details by email and we will come back to you with a price. Getting in touch does not place an order and takes no payment.'}
      </p>
      <div className="mt-6">
        <QuoteLink
          service={quoteSlug(serviceType)}
          product={productId}
          source={sourcePath}
          className={CTA_CLASS}
        >
          {label}
        </QuoteLink>
      </div>
    </section>
  )
}
