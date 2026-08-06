import type { Metadata } from 'next'
import Link from 'next/link'
import { QuoteFormClient } from './QuoteFormClient'
import { serviceFromSlug } from './quote-form-validation'
import { Section } from '@/components/ui/Layout'
import { Notice } from '@/components/ui/Notice'
import { PageHero } from '@/components/ui/PageHero'
import { businessPhone, contactEmail, emailHref, phoneHref, quoteFormEnabled, whatsappHref } from '@/lib/site-contact'

/**
 * Quote page (Jira 10301, restyled in 10307).
 *
 * Unchanged: both feature-flag branches, the GUID product guard, the same-origin
 * source-path guard, and every word that says this is not an order and takes no
 * payment. Nothing here implies an instant quote, a guaranteed response time or
 * a confirmed order — the visual treatment deliberately avoids the "get an
 * instant price" idiom for that reason.
 *
 * The hero is `inverse`, not the rainbow gradient: `/quote` is a section-entry
 * page, and four different page types previously shared one identical band.
 */

export const metadata: Metadata = {
  title: 'Request a Printing Quote',
  description: 'Tell Otahuhu Printing about your garment, badge, banner, card, sticker, label or signage requirements.',
  alternates: { canonical: '/quote' },
}

const isGuid = (value?: string) => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))

export default function QuotePage({ searchParams }: { searchParams?: { service?: string; product?: string; source?: string } }) {
  if (!quoteFormEnabled) {
    return (
      <Section>
        <div className="content-measure text-center">
          <p className="eyebrow">Quote form unavailable</p>
          <h1 className="display-page mt-4">Request a quote by email</h1>
          <p className="mt-5 text-base leading-relaxed text-ink-secondary">
            The on-site quote form is not enabled yet. You can still contact us directly.
          </p>
          <div className="mt-8 flex min-w-0 flex-wrap justify-center gap-3">
            <a className="btn-black" href={emailHref}>Email {contactEmail}</a>
            {phoneHref && businessPhone && <a className="btn-glass" href={phoneHref}>Call {businessPhone}</a>}
            {whatsappHref && <a className="btn-glass" href={whatsappHref} target="_blank" rel="noreferrer">WhatsApp</a>}
            <Link className="btn-glass" href="/contact">Contact details</Link>
          </div>
        </div>
      </Section>
    )
  }

  const service = serviceFromSlug(searchParams?.service) ?? 'GarmentPrinting'
  const productId = isGuid(searchParams?.product) ? searchParams?.product : undefined
  const source = searchParams?.source?.startsWith('/') && !searchParams.source.startsWith('//') ? searchParams.source.slice(0, 200) : '/quote'

  return (
    <>
      <PageHero
        variant="inverse"
        align="center"
        eyebrow="No payment required"
        title="Request a printing quote"
        lead="Share the practical details and optional artwork. We will review the request and confirm any price before payment."
      />
      <Section spacing="tight">
        <div className="mx-auto max-w-measure-wide">
          <Notice tone="info" className="mb-6">
            Sending this form does not place an order and takes no payment. We reply by email using
            the address you give us.
          </Notice>
          <QuoteFormClient initialService={service} productId={productId} sourcePath={source} />
        </div>
      </Section>
    </>
  )
}
