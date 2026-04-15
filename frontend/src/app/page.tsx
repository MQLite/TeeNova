import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { ProductCard } from '@/components/products/ProductCard'

export default async function HomePage() {
  const { items: featured } = await catalogApi.getProducts({ maxResultCount: 3, isActive: true })

  return (
    <>
      {/* ─── HERO ──────────────────────────────────────────────────────────── */}
      <section className="hero-gradient relative overflow-hidden py-24 sm:py-36">
        <div className="section-container relative z-10">
          <div className="mx-auto max-w-3xl text-center">

            {/* Eyebrow label */}
            <p className="mb-8 font-mono text-sm uppercase tracking-[0.54px] text-white/80">
              Auckland&apos;s Local Print Shop
            </p>

            {/* Headline */}
            <h1 className="display-hero mb-8 text-white">
              Custom T-Shirts,<br />
              Made in Auckland
            </h1>

            <p className="body-large mx-auto mb-10 max-w-xl text-white/75"
               style={{ fontWeight: 400 }}>
              Upload your artwork, choose your print position, and get quality garments
              delivered anywhere in New Zealand.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/products" className="btn-white">
                Shop Products
              </Link>
              <Link href="/#how-it-works"
                className="inline-flex items-center justify-center gap-1.5 rounded-[50px] px-[22px] py-[10px] text-base text-white/80 transition-colors hover:text-white"
                style={{ letterSpacing: '-0.14px', background: 'rgba(255,255,255,0.16)' }}>
                How It Works
              </Link>
            </div>

            {/* Trust pills */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
              {['Fast turnaround', 'Quality guaranteed', 'NZ wide shipping', 'No minimum order'].map((t) => (
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
              { value: '500+', label: 'Happy customers' },
              { value: '1-week', label: 'Avg. turnaround' },
              { value: '100%', label: 'Satisfaction rate' },
              { value: 'NZ Wide', label: 'Shipping' },
            ].map(({ value, label }) => (
              <div key={label} className="flex flex-col items-center py-8 px-4 text-center">
                <span className="text-3xl text-black" style={{ fontWeight: 400, letterSpacing: '-0.96px' }}>{value}</span>
                <span className="mt-1 text-xs text-black/55" style={{ letterSpacing: '0.02em' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURED PRODUCTS ─────────────────────────────────────────────── */}
      {featured.length > 0 && (
        <section className="py-20 sm:py-28">
          <div className="section-container">
            <div className="mb-12 flex items-end justify-between">
              <div>
                <p className="mb-3 font-mono text-sm uppercase tracking-[0.54px] text-black/55">
                  Our Collection
                </p>
                <h2 className="display-section">Premium Custom<br />T-Shirts</h2>
              </div>
              <Link href="/products"
                className="hidden text-sm text-black underline underline-offset-2 hover:opacity-60 transition-opacity sm:block"
                style={{ letterSpacing: '-0.14px' }}>
                View all →
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            <div className="mt-8 text-center sm:hidden">
              <Link href="/products" className="btn-glass">View all products</Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="border-t border-black/[0.08] py-20 sm:py-28 bg-black text-white">
        <div className="section-container">
          <div className="mb-16 text-center">
            <p className="mb-3 font-mono text-sm uppercase tracking-[0.54px] text-white/40">
              Simple Process
            </p>
            <h2 className="display-section text-white">4 Steps to Your<br />Custom Tee</h2>
            <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-white/55"
               style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
              From idea to doorstep in days — no design experience needed.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-px bg-white/[0.08] rounded-lg overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: '01',
                title: 'Pick a Product',
                desc: 'Browse our range of premium tees. Choose your base garment, colour, and size.',
              },
              {
                step: '02',
                title: 'Upload Your Design',
                desc: 'Upload your PNG, SVG, or JPEG. Select exactly where on the shirt it prints.',
              },
              {
                step: '03',
                title: 'Confirm With Us',
                desc: "We'll reach out to confirm the design details before printing so everything looks perfect.",
              },
              {
                step: '04',
                title: 'We Print & Ship',
                desc: 'Your order is printed and shipped to your door anywhere in NZ.',
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
            <h2 className="display-section">Built for Auckland<br />Businesses &amp; Events</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: 'Professional Grade Print', desc: 'Commercial DTG and screen printing for vivid, durable results.' },
              { title: 'Fast Turnaround', desc: 'Most orders ready within the week. Rush options available.' },
              { title: 'No Minimum Order', desc: 'Order just one or one thousand. Same great quality every time.' },
              { title: 'Local Team', desc: 'Proudly based in Otahuhu. Real people you can talk to.' },
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
            <h2 className="display-section">Custom Tees for<br />Every Occasion</h2>
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

      {/* ─── CTA BANNER ────────────────────────────────────────────────────── */}
      <section className="hero-gradient py-20 sm:py-28">
        <div className="section-container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="display-section text-white mb-6">
              Ready to Create Your<br />Custom T-Shirt?
            </h2>
            <p className="mx-auto mb-10 max-w-md text-base leading-relaxed text-white/70"
               style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
              Join hundreds of Auckland customers who trust us for their custom printing needs.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/products" className="btn-white">
                Start Designing Now
              </Link>
              <Link href="/#how-it-works"
                className="inline-flex items-center justify-center gap-1.5 rounded-[50px] px-[22px] py-[10px] text-base text-white/80 transition-colors hover:text-white"
                style={{ letterSpacing: '-0.14px', background: 'rgba(255,255,255,0.16)' }}>
                Learn More
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
