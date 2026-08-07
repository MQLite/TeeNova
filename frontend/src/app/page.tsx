import type { Metadata } from 'next'
import Link from 'next/link'
import { QuoteLink } from '@/components/QuoteLink'
import { portfolioApi, portfolioEnabled } from '@/api/portfolio'
import { PortfolioGrid } from '@/components/portfolio/PortfolioGrid'
import { ServiceCardGrid } from '@/components/services/ServiceCard'
import { Icon, type IconName } from '@/components/ui/Icon'
import { ActionGroup, PageContainer, Section, SectionHeading } from '@/components/ui/Layout'
import { defaultDescription, defaultSocialDescription, defaultTitle } from '@/lib/seo/identity'
import { buildPageMetadata } from '@/lib/seo/metadata'
import { publishedServices } from '@/lib/service-content/registry'
import { approvedBusinessFacts } from '@/lib/site-business'

/**
 * Homepage (Jira 10307 presentation pass).
 *
 * Preserved exactly: the Jira 10305 compact mobile hero (`py-8 sm:py-24
 * lg:py-36` on `section.hero-gradient` — asserted by two test files), the
 * published-service registry as the source of the service grid, the conditional
 * Recent Work section, and the absence of every unverified trust claim. No
 * photography, review count, rating, customer logo or turnaround promise is
 * introduced here, and the page is designed to look finished without them.
 *
 * The rainbow gradient stays, bounded to two bands — the hero and the closing
 * CTA (Jira 10300 §14.4) — and is now scrimmed inside the `.hero-gradient`
 * token so white type on it is not sitting at ~1.1:1 over the yellow stop.
 */

/**
 * Homepage metadata (Jira 10308). The title is used verbatim rather than templated — it already
 * carries the brand name. The canonical is the bare origin: the homepage has no query variants.
 */
export const metadata: Metadata = buildPageMetadata({
  title: defaultTitle,
  absoluteTitle: true,
  description: defaultDescription,
  socialDescription: defaultSocialDescription,
  path: '/',
  policy: 'index',
})

async function RecentWork() {
  const items = await portfolioApi.list(6).then(result => result.items.slice(0, 6)).catch(() => [])
  return <PortfolioGrid items={items} heading="Recent Work" />
}

// Audience cues. Previously six emoji, which rendered as a different illustration on every
// platform and could not take the surrounding text colour. Icons come from the one shared family.
const AUDIENCES: { icon: IconName; label: string }[] = [
  { icon: 'community', label: 'Churches' },
  { icon: 'team', label: 'Sports Teams' },
  { icon: 'event', label: 'Events' },
  { icon: 'business', label: 'Businesses' },
  { icon: 'school', label: 'Schools' },
  { icon: 'gift', label: 'Gifts' },
]

const STEPS = [
  {
    step: '01',
    title: 'Choose or Enquire',
    desc: 'Pick a product online, or request a quote for custom and large-format jobs.',
  },
  {
    step: '02',
    title: 'Send Your Artwork',
    desc: 'Upload your design or just send us your idea — whatever you have to start.',
  },
  {
    step: '03',
    title: 'Confirm Price & Time',
    desc: "We'll confirm the quoted price and available timing before production.",
  },
  {
    step: '04',
    title: 'Approve the Job',
    desc: 'Review the job details and approve them before production proceeds.',
  },
  {
    step: '05',
    title: 'Confirm Fulfilment',
    desc: 'Confirm the available pickup or delivery arrangement for the job.',
  },
]

export default function HomePage() {
  const businessFacts = approvedBusinessFacts()
  const hoursSentence = businessFacts.openingHours
    ?.map((row) => `${row.label} ${row.display}`)
    .join(' and ')

  return (
    <>
      {/* ─── HERO ──────────────────────────────────────────────────────────── */}
      {/* The `py-8 sm:py-24 lg:py-36` triple is a Jira 10305 acceptance criterion:
          the mobile hero must stay short enough that the primary CTA and the top
          of the next section are visible at 375×667. Do not fold it into a
          shared hero variant — the guarantee has to be readable here. */}
      <section className="hero-gradient relative overflow-hidden py-8 sm:py-24 lg:py-36">
        <PageContainer>
          <div className="mx-auto max-w-measure-wide text-center">
            <p className="eyebrow eyebrow-on-accent mb-4 sm:mb-7">
              Otahuhu, Auckland · Local Print Shop
            </p>

            <h1 className="display-hero mb-4 text-ink-inverse sm:mb-7">
              Custom Printing<br />
              in Auckland
            </h1>

            <p className="body-large mx-auto mb-6 max-w-measure text-ink-on-accent-muted sm:mb-9">
              Request garment printing, pull-up banners, badges, business cards, stickers and signage,
              or browse products available to configure online.
            </p>

            <ActionGroup align="center">
              <Link href="/products" className="btn-white btn-lg">
                Browse Products
              </Link>
              <QuoteLink source="/" className="btn-glass btn-glass-inverse btn-lg">
                Request a Quote
              </QuoteLink>
              <Link href="/#how-it-works" className="btn-text text-ink-on-accent-muted hover:text-ink-inverse">
                How It Works
              </Link>
            </ActionGroup>
          </div>
        </PageContainer>
      </section>

      {/* ─── WHAT WE PRINT (SERVICE CATEGORIES) ────────────────────────────── */}
      {/* Derived from the published-service registry (Jira 10306), replacing the hard-coded array
          that shipped four `mailto:` cards and one card pointing at the unfinished `/customize`
          Design Studio placeholder. Only published services appear, ordering is deterministic
          (`sortOrder`), and every card leads to a real page. The id remains the target of the
          Header "Services / What We Print" anchor (Jira 9604). */}
      <Section id="what-we-print" className="scroll-mt-20">
        <SectionHeading
          align="center"
          eyebrow="Printing Services"
          title="What We Print"
          lead="From T-shirts, badges and banners to business cards, stickers, labels, signs and corflute — plus custom print jobs, your local Otahuhu print shop can help."
        />

        <div className="mt-10">
          <ServiceCardGrid services={publishedServices()} />
        </div>

        <div className="mt-8 text-center">
          <Link href="/services" className="btn-text">
            See all printing services
            <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        </div>
      </Section>

      {portfolioEnabled ? <RecentWork /> : null}

      {/* ─── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <Section id="how-it-works" tone="inverse" className="scroll-mt-20">
        <SectionHeading
          align="center"
          tone="inverse"
          eyebrow="Simple Process"
          title={<>From Idea to<br />Print Request</>}
          lead="Whether it's garments, badges, banners or signage — here's how a print job comes together."
        />

        <ol className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-line-inverse sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map(({ step, title, desc }) => (
            <li key={step} className="bg-surface-inverse px-6 py-8">
              <span aria-hidden="true" className="mb-4 block text-3xl font-semibold text-white/15">
                {step}
              </span>
              <h3 className="mb-2 text-base font-semibold text-ink-inverse">{title}</h3>
              <p className="text-sm leading-relaxed text-ink-inverse-secondary">{desc}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ─── USE CASES ─────────────────────────────────────────────────────── */}
      <Section spacing="tight" divided>
        <SectionHeading
          align="center"
          eyebrow="Perfect For"
          title={<>Custom Printing for<br />Every Occasion</>}
        />
        <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {AUDIENCES.map(({ icon, label }) => (
            <li
              key={label}
              className="card card-interactive flex flex-col items-center justify-center gap-3 px-3 py-7 text-center"
            >
              <Icon name={icon} className="h-7 w-7 text-ink-secondary" />
              <span className="text-sm text-ink-secondary">{label}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* ─── CONTACT / LOCATION TEASER ─────────────────────────────────────── */}
      {/* Compact teaser (Jira 9605) surfacing the /contact page from the homepage. Kept light
          (non-gradient) so it doesn't duplicate the gradient CTA banner directly below. */}
      <Section spacing="tight" divided>
        <div className="card flex flex-col items-center gap-6 p-6 text-center sm:flex-row sm:justify-between sm:p-8 sm:text-left">
          <div className="min-w-0">
            {/* Address and hours read from the one NAP module (Jira 10308) rather than being
                written out here, so the homepage, the footer, the contact page and any structured
                data cannot disagree about them. The strings are unchanged. */}
            {businessFacts.address && (
              <p className="eyebrow mb-2">{businessFacts.address.singleLine}</p>
            )}
            <h2 className="display-sub">
              {businessFacts.address ? 'Visit or Contact' : 'Contact'} Our Otahuhu Print Shop
            </h2>
            <p className="mt-2 max-w-measure text-sm leading-relaxed text-ink-muted">
              Need help with a print job? Contact us about T-shirts, badges, banners,
              signs and custom jobs.{hoursSentence ? ` Open ${hoursSentence}.` : ''}
            </p>
          </div>
          <ActionGroup align="center" className="shrink-0 sm:justify-end">
            <Link href="/contact" className="btn-black">
              Contact Us
            </Link>
            <QuoteLink source="/" className="btn-glass">
              Request a Quote
            </QuoteLink>
          </ActionGroup>
        </div>
      </Section>

      {/* ─── CTA BANNER ────────────────────────────────────────────────────── */}
      {/* The second and last full-bleed use of the accent gradient on the site. */}
      <section className="hero-gradient py-16 sm:py-20">
        <PageContainer>
          <div className="mx-auto max-w-measure text-center">
            <h2 className="display-section mb-5 text-ink-inverse">
              Ready to Start Your<br />Print Project?
            </h2>
            <p className="mx-auto mb-8 max-w-measure text-base leading-relaxed text-ink-on-accent-muted">
              Browse our products online, or get in touch with your local Otahuhu print shop for a quote.
            </p>
            <ActionGroup align="center">
              <Link href="/products" className="btn-white btn-lg">
                Browse Products
              </Link>
              <QuoteLink source="/" className="btn-glass btn-glass-inverse btn-lg">
                Request a Quote
              </QuoteLink>
            </ActionGroup>
          </div>
        </PageContainer>
      </section>
    </>
  )
}
