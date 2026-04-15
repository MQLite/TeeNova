import Link from 'next/link'

export function Footer() {
  return (
    <footer className="bg-black text-white/55">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">

          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                <svg viewBox="0 0 24 24" fill="white" className="h-4 w-4">
                  <path d="M6 2L2 6l3 2v12h14V8l3-2-4-4s-1 2-4 2-4-2-4-2H6z" />
                </svg>
              </div>
              <span
                className="text-sm text-white"
                style={{ fontWeight: 540, letterSpacing: '-0.26px' }}
              >
                Otahuhu Printing
              </span>
            </div>
            <p className="mt-5 max-w-xs text-sm leading-relaxed" style={{ letterSpacing: '-0.14px' }}>
              Auckland&apos;s local custom print shop. Perfect for events, businesses,
              churches, clubs, sports teams, and gifts.
            </p>
            <div className="mt-5 flex gap-2">
              {['Facebook', 'Instagram'].map((s) => (
                <span key={s}
                  className="rounded-full border border-white/10 px-4 py-1.5 text-xs text-white/50 hover:border-white/25 hover:text-white cursor-pointer transition-colors"
                  style={{ letterSpacing: '0.02em' }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Shop */}
          <div>
            <h3 className="mb-4 font-mono text-[11px] font-normal uppercase tracking-[0.54px] text-white/30">
              Shop
            </h3>
            <ul className="space-y-2.5 text-sm" style={{ letterSpacing: '-0.14px' }}>
              {[
                { href: '/products', label: 'All Products' },
                { href: '/products', label: 'T-Shirts' },
                { href: '/products', label: 'Hoodies' },
                { href: '/#how-it-works', label: 'How It Works' },
              ].map(({ href, label }) => (
                <li key={label}>
                  <Link href={href} className="hover:text-white transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="mb-4 font-mono text-[11px] font-normal uppercase tracking-[0.54px] text-white/30">
              Support
            </h3>
            <ul className="space-y-2.5 text-sm" style={{ letterSpacing: '-0.14px' }}>
              {[
                { href: '#', label: 'Sizing Guide' },
                { href: '#', label: 'File Requirements' },
                { href: '#', label: 'Shipping Info' },
                { href: '#', label: 'Contact Us' },
              ].map(({ href, label }) => (
                <li key={label}>
                  <Link href={href} className="hover:text-white transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-lg border border-white/[0.08] p-4">
              <p className="text-xs font-medium text-white">Otahuhu, Auckland</p>
              <p className="mt-1 text-xs" style={{ letterSpacing: '-0.14px' }}>Mon–Fri 8am–6pm</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs sm:flex-row sm:px-6 lg:px-8">
          <p style={{ letterSpacing: '-0.14px' }}>
            © {new Date().getFullYear()} Otahuhu Printing Shop. All rights reserved.
          </p>
          <div className="flex items-center gap-1.5">
            {['VISA', 'Mastercard', 'PayPal'].map((p) => (
              <span key={p} className="rounded border border-white/10 px-2 py-1 text-[10px] text-white/40 tracking-wide">{p}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
