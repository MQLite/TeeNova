import type { Metadata } from 'next'
import Link from 'next/link'
import { QuoteLink } from '@/components/QuoteLink'
import { Icon } from '@/components/ui/Icon'
import { ActionGroup, CardGrid, Section, SectionHeading } from '@/components/ui/Layout'
import { PageHero } from '@/components/ui/PageHero'
import { contactEmail, emailHref } from '@/lib/site-contact'

// Contact / Location page (Jira 9605). Frontend-only, no backend form and no email-sending: the quote
// and contact actions all use the existing storefront mailto pattern. Business details shown (street
// address, suburb, hours, email) are the owner-provided shop details — no invented phone, parking
// notes, or social URLs. LocalBusiness JSON-LD is intentionally deferred to 9606/10308.
//
// Jira 10307: the two full-bleed rainbow bands on this page are gone. The accent gradient is now
// bounded to the homepage hero and the homepage closing CTA (Jira 10300 §14.4); every other page
// uses the black `inverse` or the warm `plain` treatment, so the gradient means "home" again.

const CONTACT_EMAIL = contactEmail
const SHOP_ADDRESS = '483 Great South Road, Otahuhu, Auckland 1062'
// Google Maps search for the shop's street address (no Maps API dependency/key).
const MAPS_SEARCH_URL =
  'https://www.google.com/maps/search/?api=1&query=483+Great+South+Road%2C+Otahuhu%2C+Auckland+1062'

export const metadata: Metadata = {
  title: 'Contact Otahuhu Printing Shop | Custom Printing Auckland',
  description:
    'Contact Otahuhu Printing Shop for T-shirt printing, badges, banners, business cards, stickers, signs and local Auckland print jobs.',
  openGraph: {
    title: 'Contact Otahuhu Printing Shop | Custom Printing Auckland',
    description:
      'Contact Otahuhu Printing Shop for T-shirt printing, badges, banners, business cards, stickers, signs and local Auckland print jobs.',
    type: 'website',
    locale: 'en_NZ',
    siteName: 'Otahuhu Printing Shop',
  },
}

const CONTACT_CARDS: { label: string; value: string; note?: string; href?: string }[] = [
  { label: 'Email', value: CONTACT_EMAIL, note: 'Best way to reach us', href: emailHref },
  { label: 'Location', value: SHOP_ADDRESS, note: 'Local print shop' },
  { label: 'Hours', value: 'Mon–Fri 9am–5pm', note: 'Sat 10am–4pm' },
  { label: 'Pickup / delivery', value: 'Ask which options are available for your job' },
]

const QUOTE_CHECKLIST = [
  'Product type (T-shirts, badges, banners, business cards, stickers, signs, etc.)',
  'Quantity',
  'Size',
  'Your artwork or design file',
  'Required date',
  'Pickup or delivery preference',
]

export default function ContactPage() {
  return (
    <>
      <PageHero
        variant="inverse"
        align="center"
        eyebrow="Otahuhu, Auckland"
        title={<>Contact Otahuhu<br />Printing Shop</>}
        lead="Contact us about T-shirts, badges, banners, business cards, stickers, signs and custom print jobs."
        actions={
          <>
            <QuoteLink source="/contact" className="btn-white btn-lg">
              Request a Quote
            </QuoteLink>
            <Link href="/products" className="btn-glass btn-glass-inverse btn-lg">
              Browse Products
            </Link>
          </>
        }
      />

      {/* ─── CONTACT CARDS ─────────────────────────────────────────────────── */}
      <Section spacing="tight">
        <CardGrid columns={4}>
          {CONTACT_CARDS.map((card) => (
            <div key={card.label} className="card p-5 sm:p-6">
              <p className="eyebrow">{card.label}</p>
              {card.href ? (
                <a
                  href={card.href}
                  className="link mt-2 block break-words text-base font-medium"
                >
                  {card.value}
                </a>
              ) : (
                <p className="mt-2 text-base font-medium text-ink">{card.value}</p>
              )}
              {card.note && <p className="mt-1 text-sm text-ink-muted">{card.note}</p>}
            </div>
          ))}
        </CardGrid>
      </Section>

      {/* ─── REQUEST A QUOTE ───────────────────────────────────────────────── */}
      <Section spacing="tight" divided>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHeading
              eyebrow="Request a Quote"
              title={<>Tell Us About<br />Your Print Job</>}
              lead="Email us the details below and we'll confirm the quoted price and available timing. No payment is taken up front."
            />
            <div className="mt-8">
              <QuoteLink source="/contact" className="btn-black">
                Request a Quote
              </QuoteLink>
            </div>
          </div>

          <div className="card p-6 sm:p-8">
            <p className="text-sm font-semibold text-ink">What to include in your email</p>
            <ul className="mt-5 space-y-3">
              {QUOTE_CHECKLIST.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-ink-secondary">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
                    <Icon name="check" className="h-3 w-3" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* ─── FIND US ───────────────────────────────────────────────────────── */}
      <Section spacing="tight" divided>
        <div className="mx-auto max-w-measure-wide text-center">
          <SectionHeading
            align="center"
            eyebrow="Find Us"
            title={<>Find Us in<br />Otahuhu, Auckland</>}
            lead={`Find us at ${SHOP_ADDRESS}. Get in touch to arrange pickup, or ask us about the fulfilment options available for your order.`}
          />
          <ActionGroup align="center" className="mt-8">
            <a href={MAPS_SEARCH_URL} target="_blank" rel="noreferrer" className="btn-glass">
              Open in Google Maps
              <Icon name="external" className="h-4 w-4" />
            </a>
            <a href={emailHref} className="btn-black">
              Contact Us
            </a>
          </ActionGroup>
          <p className="eyebrow mt-6">{SHOP_ADDRESS}</p>
        </div>
      </Section>

      {/* ─── SERVICES REMINDER ─────────────────────────────────────────────── */}
      <Section spacing="tight" tone="alt" divided>
        <div className="mx-auto max-w-measure text-center">
          <h2 className="display-section mb-6">
            Explore What<br />We Print
          </h2>
          <ActionGroup align="center">
            {/* Unchanged target: the homepage "What We Print" anchor (Jira 9604/9605). */}
            <Link href="/#what-we-print" className="btn-black">
              What We Print
            </Link>
            <Link href="/products" className="btn-glass">
              Browse Products
            </Link>
            <QuoteLink source="/contact" className="btn-glass">
              Request a Quote
            </QuoteLink>
          </ActionGroup>
        </div>
      </Section>
    </>
  )
}
