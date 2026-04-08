import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { catalogApi } from '@/api/catalog'
import { ProductCard } from '@/components/products/ProductCard'

export default async function HomePage() {
  const { items: featured } = await catalogApi.getProducts({ maxResultCount: 3, isActive: true })

  return (
    <>
      {/* ─── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-950 via-[#4a1272] to-brand-700">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 bottom-0 h-80 w-80 rounded-full bg-purple-400/20 blur-3xl" />

        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">

            {/* Left — copy */}
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
                <span className="h-2 w-2 rounded-full bg-green-400" />
                Auckland&apos;s Custom Print Shop · Same Week Delivery
              </div>

              <h1 className="mt-2 text-5xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl">
                Design Your<br />
                <span className="text-brand-300">Custom T-Shirt</span><br />
                Online
              </h1>

              <p className="mt-6 max-w-lg text-lg leading-relaxed text-purple-200">
                Upload your artwork, choose your print position, and get quality garments
                printed and delivered anywhere in New Zealand. Perfect for events, businesses,
                churches &amp; clubs.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="xl" asChild>
                  <Link href="/products">Shop Products</Link>
                </Button>
                <Button size="xl" variant="outline-white" asChild>
                  <Link href="/#how-it-works">See How It Works</Link>
                </Button>
              </div>

              {/* Trust row */}
              <div className="mt-10 flex flex-wrap gap-5 text-sm text-purple-200">
                {[
                  { icon: '⚡', text: 'Fast turnaround' },
                  { icon: '✓', text: 'Quality guaranteed' },
                  { icon: '📦', text: 'NZ wide shipping' },
                ].map(({ icon, text }) => (
                  <span key={text} className="flex items-center gap-1.5">
                    <span>{icon}</span>
                    {text}
                  </span>
                ))}
              </div>
            </div>

            {/* Right — T-shirt mockup illustration */}
            <div className="flex justify-center lg:justify-end">
              <div className="relative">
                {/* Glow */}
                <div className="absolute inset-0 scale-110 rounded-full bg-brand-500/30 blur-3xl" />

                {/* Card */}
                <div className="relative rounded-3xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-sm">
                  <HeroTShirt />
                  {/* Label */}
                  <p className="mt-3 text-center text-sm font-medium text-white/70">Your design here</p>
                </div>

                {/* Floating badges */}
                <div className="absolute -left-6 top-10 rounded-2xl bg-white px-4 py-2.5 shadow-xl">
                  <p className="text-xs font-bold text-gray-900">✓ 100% Cotton</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Premium quality</p>
                </div>
                <div className="absolute -right-6 bottom-14 rounded-2xl bg-brand-600 px-4 py-2.5 shadow-xl">
                  <p className="text-xs font-bold text-white">From $29.99</p>
                  <p className="text-[10px] text-brand-200 mt-0.5">No minimum order</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── STATS BAR ─────────────────────────────────────────────────────── */}
      <section className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 divide-x divide-gray-100 sm:grid-cols-4">
            {[
              { value: '500+', label: 'Happy customers' },
              { value: '1-week', label: 'Avg. turnaround' },
              { value: '100%', label: 'Satisfaction rate' },
              { value: 'NZ Wide', label: 'Shipping' },
            ].map(({ value, label }) => (
              <div key={label} className="flex flex-col items-center py-6 px-4 text-center">
                <span className="text-2xl font-extrabold text-brand-600">{value}</span>
                <span className="mt-1 text-xs font-medium text-gray-500">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURED PRODUCTS ─────────────────────────────────────────────── */}
      {featured.length > 0 && (
        <section className="bg-gray-50 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 flex items-end justify-between">
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-brand-600">Our Collection</p>
                <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                  Premium Custom T-Shirts
                </h2>
              </div>
              <Link
                href="/products"
                className="hidden items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700 sm:flex"
              >
                View all →
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            <div className="mt-8 text-center sm:hidden">
              <Button variant="secondary" asChild>
                <Link href="/products">View all products</Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ─── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-brand-600">Simple Process</p>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              3 Steps to Your Custom Tee
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-gray-500">
              From idea to doorstep in days — no design experience needed.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-0 sm:grid-cols-3">
            {[
              {
                step: '01',
                icon: '👕',
                title: 'Pick a Product',
                desc: 'Browse our range of premium tees. Choose your base garment, colour, and size.',
              },
              {
                step: '02',
                icon: '🎨',
                title: 'Upload Your Design',
                desc: 'Upload your PNG, SVG, or JPEG. Select exactly where on the shirt it prints.',
              },
              {
                step: '03',
                icon: '📦',
                title: 'We Print & Ship',
                desc: 'We handle the rest. Your order is printed and shipped to your door in NZ.',
              },
            ].map(({ step, icon, title, desc }, i) => (
              <div key={step} className="relative flex flex-col items-center px-8 py-10 text-center">
                {/* Connector line */}
                {i < 2 && (
                  <div className="absolute right-0 top-12 hidden h-px w-8 bg-gradient-to-r from-brand-200 to-transparent sm:block" />
                )}
                {/* Step number */}
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 ring-4 ring-white shadow-sm">
                  <span className="text-3xl">{icon}</span>
                </div>
                <span className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-400">Step {step}</span>
                <h3 className="mb-3 text-xl font-bold text-gray-900">{title}</h3>
                <p className="text-sm leading-relaxed text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHY CHOOSE US ─────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-brand-950 to-brand-800 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-brand-300">Why Us</p>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Built for Auckland Businesses &amp; Events
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: '🖨️',
                title: 'Professional Grade Print',
                desc: 'Commercial DTG and screen printing for vivid, durable results.',
              },
              {
                icon: '⚡',
                title: 'Fast Turnaround',
                desc: 'Most orders ready within the week. Rush options available.',
              },
              {
                icon: '📐',
                title: 'No Minimum Order',
                desc: 'Order just one or one thousand. Same great quality every time.',
              },
              {
                icon: '🤝',
                title: 'Local Team',
                desc: 'Proudly based in Otahuhu. Real people you can talk to.',
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm hover:bg-white/10 transition-colors">
                <span className="mb-4 block text-3xl">{icon}</span>
                <h3 className="mb-2 font-bold text-white">{title}</h3>
                <p className="text-sm leading-relaxed text-purple-200">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── USE CASES ─────────────────────────────────────────────────────── */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-brand-600">Perfect For</p>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Custom Tees for Every Occasion
            </h2>
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
              <div key={label} className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-gray-50 py-6 px-4 text-center hover:border-brand-200 hover:bg-brand-50 transition-colors">
                <span className="text-3xl">{icon}</span>
                <span className="text-sm font-semibold text-gray-700">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA BANNER ────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-brand-600 py-16">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-brand-700/50 blur-2xl" />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Ready to Create Your Custom T-Shirt?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-brand-100">
            Join hundreds of Auckland customers who trust us for their custom printing needs.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button size="xl" className="bg-white !text-brand-700 hover:bg-brand-50 shadow-xl hover:shadow-2xl" asChild>
              <Link href="/products">Start Designing Now</Link>
            </Button>
            <Button size="xl" variant="outline-white" asChild>
              <Link href="/#how-it-works">Learn More</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}

/** Inline hero T-shirt SVG with a colourful star design overlay */
function HeroTShirt() {
  return (
    <svg viewBox="0 0 220 240" className="w-64 h-64 sm:w-72 sm:h-72 drop-shadow-2xl" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Shirt shadow */}
      <ellipse cx="110" cy="235" rx="70" ry="8" fill="black" opacity="0.25" />
      {/* Shirt body */}
      <path
        d="M 65 40 L 33 53 L 15 94 L 45 104 L 48 94 L 48 205 L 172 205 L 172 94 L 175 104 L 205 94 L 187 53 L 155 40 C 147 60 130 68 110 68 C 90 68 73 60 65 40 Z"
        fill="white"
        opacity="0.95"
      />
      {/* Collar curve */}
      <path
        d="M 65 40 C 76 64 93 68 110 68 C 127 68 144 64 155 40"
        fill="none"
        stroke="#e9d5ff"
        strokeWidth="1.5"
      />
      {/* Left sleeve shading */}
      <path d="M 48 94 L 15 94 L 33 53 L 65 40 C 60 55 52 75 48 94 Z" fill="#f5f3ff" opacity="0.6" />
      {/* Right sleeve shading */}
      <path d="M 172 94 L 205 94 L 187 53 L 155 40 C 160 55 168 75 172 94 Z" fill="#f5f3ff" opacity="0.6" />

      {/* Design area — glowing circle background */}
      <circle cx="110" cy="145" r="38" fill="#a855f7" opacity="0.12" />

      {/* Star design (5-point polygon) */}
      <polygon
        points="110,112 117,132 138,132 122,144 128,164 110,152 92,164 98,144 82,132 103,132"
        fill="#9333ea"
        opacity="0.85"
      />
      {/* Star highlight */}
      <polygon
        points="110,116 115.5,132 133,132 119.5,141.5 124.5,158 110,148.5 95.5,158 100.5,141.5 87,132 104.5,132"
        fill="#c084fc"
        opacity="0.5"
      />
    </svg>
  )
}
