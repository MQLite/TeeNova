import type { Metadata } from 'next'
import Link from 'next/link'

// Contact / Location page (Jira 9605). Frontend-only, no backend form and no email-sending: the quote
// and contact actions all use the existing storefront mailto pattern. Business details shown (street
// address, suburb, hours, email) are the owner-provided shop details — no invented phone, parking
// notes, or social URLs. LocalBusiness JSON-LD is intentionally deferred to 9606.

const CONTACT_EMAIL = 'quanlitycanvasltd@gmail.com'
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
  { label: 'Email', value: CONTACT_EMAIL, note: 'Best way to reach us', href: `mailto:${CONTACT_EMAIL}` },
  { label: 'Location', value: SHOP_ADDRESS, note: 'Local print shop' },
  { label: 'Hours', value: 'Mon–Fri 9am–5pm', note: 'Sat 10am–4pm' },
  { label: 'Pickup / delivery', value: 'Pickup in Otahuhu or NZ-wide delivery' },
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
      {/* ─── HERO ──────────────────────────────────────────────────────────── */}
      <section className="hero-gradient relative overflow-hidden py-20 sm:py-28">
        <div className="section-container relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-8 font-mono text-sm uppercase tracking-[0.54px] text-white/80">
              Otahuhu, Auckland
            </p>
            <h1 className="display-hero mb-8 text-white">
              Contact Otahuhu<br />Printing Shop
            </h1>
            <p className="body-large mx-auto mb-10 max-w-xl text-white/75" style={{ fontWeight: 400 }}>
              Friendly local printing support for T-shirts, badges, banners, business cards,
              stickers, signs and custom print jobs.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a href={`mailto:${CONTACT_EMAIL}`} className="btn-white">
                Request a Quote
              </a>
              <Link href="/products"
                className="inline-flex items-center justify-center gap-1.5 rounded-[50px] px-[22px] py-[10px] text-base text-white/80 transition-colors hover:text-white"
                style={{ letterSpacing: '-0.14px', background: 'rgba(255,255,255,0.16)' }}>
                Browse Products
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CONTACT CARDS ─────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20">
        <div className="section-container">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CONTACT_CARDS.map((card) => (
              <div key={card.label} className="card p-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                  {card.label}
                </p>
                {card.href ? (
                  <a
                    href={card.href}
                    className="mt-2 block break-words text-base text-black underline underline-offset-2 transition-opacity hover:opacity-60"
                    style={{ fontWeight: 480, letterSpacing: '-0.26px' }}
                  >
                    {card.value}
                  </a>
                ) : (
                  <p className="mt-2 text-base text-black" style={{ fontWeight: 480, letterSpacing: '-0.26px' }}>
                    {card.value}
                  </p>
                )}
                {card.note && (
                  <p className="mt-1 text-sm text-black/50" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
                    {card.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── REQUEST A QUOTE ───────────────────────────────────────────────── */}
      <section className="border-t border-black/[0.08] py-16 sm:py-20">
        <div className="section-container">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="mb-3 font-mono text-sm uppercase tracking-[0.54px] text-black/55">
                Request a Quote
              </p>
              <h2 className="display-section">Tell Us About<br />Your Print Job</h2>
              <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-black/55"
                 style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
                Email us the details below and we&apos;ll confirm your price and turnaround. No payment
                is taken up front.
              </p>
              <div className="mt-8">
                <a href={`mailto:${CONTACT_EMAIL}`} className="btn-black">
                  Request a Quote
                </a>
              </div>
            </div>

            <div className="card p-8">
              <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                What to include in your email
              </p>
              <ul className="mt-5 space-y-3">
                {QUOTE_CHECKLIST.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-black/60" style={{ letterSpacing: '-0.14px' }}>
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-[11px] text-black/50">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FIND US ───────────────────────────────────────────────────────── */}
      <section className="border-t border-black/[0.08] py-16 sm:py-20">
        <div className="section-container">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-3 font-mono text-sm uppercase tracking-[0.54px] text-black/55">
              Find Us
            </p>
            <h2 className="display-section">Find Us in<br />Otahuhu, Auckland</h2>
            <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-black/55"
               style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
              Find us at {SHOP_ADDRESS}. Get in touch to arrange pickup, or ask us about
              NZ-wide delivery for your order.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a
                href={MAPS_SEARCH_URL}
                target="_blank"
                rel="noreferrer"
                className="btn-glass"
              >
                Open in Google Maps →
              </a>
              <a href={`mailto:${CONTACT_EMAIL}`} className="btn-black">
                Contact Us
              </a>
            </div>
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.54px] text-black/40">
              483 Great South Road, Otahuhu, Auckland 1062
            </p>
          </div>
        </div>
      </section>

      {/* ─── SERVICES REMINDER ─────────────────────────────────────────────── */}
      <section className="hero-gradient py-16 sm:py-20">
        <div className="section-container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="display-section text-white mb-6">
              Explore What<br />We Print
            </h2>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/#what-we-print" className="btn-white">
                What We Print
              </Link>
              <Link href="/products"
                className="inline-flex items-center justify-center gap-1.5 rounded-[50px] px-[22px] py-[10px] text-base text-white/80 transition-colors hover:text-white"
                style={{ letterSpacing: '-0.14px', background: 'rgba(255,255,255,0.16)' }}>
                Browse Products
              </Link>
              <a href={`mailto:${CONTACT_EMAIL}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-[50px] px-[22px] py-[10px] text-base text-white/70 transition-colors hover:text-white"
                style={{ letterSpacing: '-0.14px' }}>
                Request a Quote
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
