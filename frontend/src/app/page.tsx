import Link from 'next/link'

// Curated homepage service categories (Jira 9603). Hardcoded, price-free, and frontend-only — no
// catalog fetch, no CMS, no category DB. `external: true` renders a plain <a> (mailto), otherwise an
// internal <Link>. Generic banner/large-format jobs use the shop mailto for a quote, NOT the Banner
// CustomQuoteOnly product enquiry form — those product flows are reached via /products and stay separate.
const SERVICE_CATEGORIES: {
  icon: string
  title: string
  desc: string
  cta: string
  href: string
  external: boolean
  tag: string
}[] = [
  {
    icon: '👕',
    title: 'T-Shirt & Garment Printing',
    desc: 'Custom T-shirts, hoodies, polos and workwear with your design.',
    cta: 'Browse garments',
    href: '/products',
    external: false,
    tag: 'Order online',
  },
  {
    icon: '🎨',
    title: 'Bring Your Own Garment',
    desc: 'Already have your own T-shirt or hoodie? Bring it in and we can print your design.',
    cta: 'Start customizing',
    href: '/customize',
    external: false,
    tag: 'Custom job',
  },
  {
    icon: '📛',
    title: 'Custom Badges',
    desc: 'Custom badge printing for events, teams, schools and branding.',
    cta: 'Browse badges',
    href: '/products',
    external: false,
    tag: 'Order online',
  },
  {
    icon: '🚩',
    title: 'Banners & Pull-Ups',
    desc: 'Pull-up banners, PVC banners and event signage for shops, churches, events and promotions.',
    cta: 'Request a quote',
    href: 'mailto:otahuhuprint@gmail.com',
    external: true,
    tag: 'Enquire',
  },
  {
    icon: '💼',
    title: 'Business Cards',
    desc: 'Professional business cards printed locally for Auckland businesses.',
    cta: 'Request a quote',
    href: 'mailto:otahuhuprint@gmail.com',
    external: true,
    tag: 'Enquire',
  },
  {
    icon: '🏷️',
    title: 'Stickers & Labels',
    desc: 'Custom stickers, labels and decals for packaging, events and promotions.',
    cta: 'Request a quote',
    href: 'mailto:otahuhuprint@gmail.com',
    external: true,
    tag: 'Enquire',
  },
  {
    icon: '🪧',
    title: 'Signs & Corflute',
    desc: 'Corflute signs and rigid signage for worksites, real estate, events and local advertising.',
    cta: 'Request a quote',
    href: 'mailto:otahuhuprint@gmail.com',
    external: true,
    tag: 'Enquire',
  },
]

export default function HomePage() {
  return (
    <>
      {/* ─── HERO ──────────────────────────────────────────────────────────── */}
      <section className="hero-gradient relative overflow-hidden py-24 sm:py-36">
        <div className="section-container relative z-10">
          <div className="mx-auto max-w-3xl text-center">

            {/* Eyebrow label */}
            <p className="mb-8 font-mono text-sm uppercase tracking-[0.54px] text-white/80">
              Otahuhu, Auckland · Local Print Shop
            </p>

            {/* Headline */}
            <h1 className="display-hero mb-8 text-white">
              Custom Printing<br />
              in Auckland
            </h1>

            <p className="body-large mx-auto mb-10 max-w-xl text-white/75"
               style={{ fontWeight: 400 }}>
              Your local Otahuhu print shop for garment printing, pull-up banners, badges,
              business cards, stickers and signage — quality work, fast turnaround, and
              friendly local support.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/products" className="btn-white">
                Browse Products
              </Link>
              <a href="mailto:otahuhuprint@gmail.com"
                className="inline-flex items-center justify-center gap-1.5 rounded-[50px] px-[22px] py-[10px] text-base text-white/80 transition-colors hover:text-white"
                style={{ letterSpacing: '-0.14px', background: 'rgba(255,255,255,0.16)' }}>
                Request a Quote
              </a>
              <Link href="/#how-it-works"
                className="inline-flex items-center justify-center gap-1.5 rounded-[50px] px-[22px] py-[10px] text-base text-white/70 transition-colors hover:text-white"
                style={{ letterSpacing: '-0.14px' }}>
                How It Works
              </Link>
            </div>

            {/* Trust pills */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
              {['Local Otahuhu team', 'Fast turnaround', 'Pickup or NZ-wide delivery', 'Artwork help available'].map((t) => (
                <span key={t}
                  className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-white/70"
                  style={{ letterSpacing: '0.02em' }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── STATS BAR ─────────────────────────────────────────────────────── */}
      <section className="border-b border-black/[0.08]">
        <div className="section-container">
          <div className="grid grid-cols-2 divide-x divide-black/[0.08] sm:grid-cols-4">
            {[
              { value: 'Otahuhu', label: 'Auckland print shop' },
              { value: 'In-house', label: 'Printing & artwork help' },
              { value: 'Multi', label: 'Tees, badges, banners, signs' },
              { value: 'NZ Wide', label: 'Pickup or delivery' },
            ].map(({ value, label }) => (
              <div key={label} className="flex flex-col items-center py-8 px-4 text-center">
                <span className="text-3xl text-black" style={{ fontWeight: 400, letterSpacing: '-0.96px' }}>{value}</span>
                <span className="mt-1 text-xs text-black/55" style={{ letterSpacing: '0.02em' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHAT WE PRINT (SERVICE CATEGORIES) ────────────────────────────── */}
      {/* Curated, price-free category grid (Jira 9603) — replaces the old live Featured Products
          fetch so no placeholder/test product prices can surface on the homepage. The id is the
          target of the Header "Services / What We Print" nav links (Jira 9604). */}
      <section id="what-we-print" className="scroll-mt-20 py-20 sm:py-28">
        <div className="section-container">
          <div className="mb-12 text-center">
            <p className="mb-3 font-mono text-sm uppercase tracking-[0.54px] text-black/55">
              Printing Services
            </p>
            <h2 className="display-section">What We Print</h2>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-black/55"
               style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
              From T-shirts, badges and banners to business cards, stickers, labels, signs and
              corflute — plus custom print jobs, your local Otahuhu print shop can help.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICE_CATEGORIES.map((cat) => {
              const inner = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-3xl leading-none">{cat.icon}</span>
                    <span className="rounded-full border border-black/[0.08] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/50">
                      {cat.tag}
                    </span>
                  </div>
                  <h3 className="mt-5 text-base text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                    {cat.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-black/55" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
                    {cat.desc}
                  </p>
                  <span
                    className="mt-5 text-xs text-black/55 underline underline-offset-2 transition-opacity group-hover:opacity-50"
                    style={{ letterSpacing: '-0.14px' }}
                  >
                    {cat.cta} →
                  </span>
                </>
              )

              const className = 'group card flex flex-col p-6 transition-shadow hover:shadow-card'

              return cat.external ? (
                <a key={cat.title} href={cat.href} className={className}>
                  {inner}
                </a>
              ) : (
                <Link key={cat.title} href={cat.href} className={className}>
                  {inner}
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="scroll-mt-20 border-t border-black/[0.08] py-20 sm:py-28 bg-black text-white">
        <div className="section-container">
          <div className="mb-16 text-center">
            <p className="mb-3 font-mono text-sm uppercase tracking-[0.54px] text-white/40">
              Simple Process
            </p>
            <h2 className="display-section text-white">From Idea to<br />Printed Locally</h2>
            <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-white/55"
               style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
              Whether it&apos;s garments, badges, banners or signage — here&apos;s how a print job comes together.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-px bg-white/[0.08] rounded-lg overflow-hidden sm:grid-cols-2 lg:grid-cols-5">
            {[
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
                desc: "We'll confirm your price and turnaround before anything goes to print.",
              },
              {
                step: '04',
                title: 'We Print Locally',
                desc: 'Your job is printed right here in Auckland by our local team.',
              },
              {
                step: '05',
                title: 'Pickup or Delivery',
                desc: 'Collect in Otahuhu or arrange delivery anywhere in New Zealand.',
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="bg-black px-8 py-10">
                <span
                  className="mb-4 block text-3xl text-white/10"
                  style={{ fontWeight: 400, letterSpacing: '-0.96px' }}
                >
                  {step}
                </span>
                <h3 className="mb-2 text-base text-white" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-white/50" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHY CHOOSE US ─────────────────────────────────────────────────── */}
      <section className="border-t border-black/[0.08] py-20 sm:py-28">
        <div className="section-container">
          <div className="mb-14 text-center">
            <p className="mb-3 font-mono text-sm uppercase tracking-[0.54px] text-black/55">Why Us</p>
            <h2 className="display-section">One Local Shop for<br />All Your Printing</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: 'Local Otahuhu Print Team', desc: 'Proudly based in Otahuhu, Auckland. Real people you can talk to.' },
              { title: 'Tees, Badges, Banners & Signage', desc: 'One local shop for garments, badges, banners, signs and more.' },
              { title: 'Artwork & Design Help', desc: "Send us your idea or artwork — we'll help get it print-ready." },
              { title: 'Fast Turnaround & Delivery', desc: 'Quick turnaround where possible. Pickup in Otahuhu or NZ-wide delivery.' },
            ].map(({ title, desc }) => (
              <div key={title} className="card p-6">
                <h3 className="mb-2 text-base text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-black/50" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── USE CASES ─────────────────────────────────────────────────────── */}
      <section className="border-t border-black/[0.08] py-20 sm:py-24">
        <div className="section-container">
          <div className="mb-12 text-center">
            <p className="mb-3 font-mono text-sm uppercase tracking-[0.54px] text-black/55">Perfect For</p>
            <h2 className="display-section">Custom Printing for<br />Every Occasion</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { icon: '⛪', label: 'Churches' },
              { icon: '🏆', label: 'Sports Teams' },
              { icon: '🎉', label: 'Events' },
              { icon: '🏢', label: 'Businesses' },
              { icon: '🎓', label: 'Schools' },
              { icon: '🎁', label: 'Gifts' },
            ].map(({ icon, label }) => (
              <div key={label}
                className="card flex flex-col items-center justify-center gap-3 py-8 px-4 text-center transition-shadow hover:shadow-card">
                <span className="text-3xl">{icon}</span>
                <span className="text-sm text-black/60" style={{ letterSpacing: '-0.14px' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CONTACT / LOCATION TEASER ─────────────────────────────────────── */}
      {/* Compact teaser (Jira 9605) surfacing the new /contact page from the homepage. Kept light
          (non-gradient) so it doesn't duplicate the gradient CTA banner directly below. */}
      <section className="border-t border-black/[0.08] py-16 sm:py-20">
        <div className="section-container">
          <div className="card flex flex-col items-center gap-6 p-8 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
                Otahuhu, Auckland
              </p>
              <h2 className="text-xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.42px' }}>
                Visit or Contact Our Otahuhu Print Shop
              </h2>
              <p className="mt-2 max-w-xl text-sm text-black/55" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
                Need help with a print job? Contact our local team for T-shirts, badges, banners,
                signs and custom jobs.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-center gap-3">
              <Link href="/contact" className="btn-black">
                Contact Us
              </Link>
              <a href="mailto:otahuhuprint@gmail.com" className="btn-glass">
                Request a Quote
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA BANNER ────────────────────────────────────────────────────── */}
      <section className="hero-gradient py-20 sm:py-28">
        <div className="section-container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="display-section text-white mb-6">
              Ready to Start Your<br />Print Project?
            </h2>
            <p className="mx-auto mb-10 max-w-md text-base leading-relaxed text-white/70"
               style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
              Browse our products online, or get in touch with your local Otahuhu print shop for a quote.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/products" className="btn-white">
                Browse Products
              </Link>
              <a href="mailto:otahuhuprint@gmail.com"
                className="inline-flex items-center justify-center gap-1.5 rounded-[50px] px-[22px] py-[10px] text-base text-white/80 transition-colors hover:text-white"
                style={{ letterSpacing: '-0.14px', background: 'rgba(255,255,255,0.16)' }}>
                Request a Quote
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
