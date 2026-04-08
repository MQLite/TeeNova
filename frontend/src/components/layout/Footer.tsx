import Link from 'next/link'

export function Footer() {
  return (
    <footer className="bg-gray-950 text-gray-300">
      {/* Main footer */}
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">

          {/* Brand column */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600">
                <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5">
                  <path d="M6 2L2 6l3 2v12h14V8l3-2-4-4s-1 2-4 2-4-2-4-2H6z" />
                </svg>
              </div>
              <div>
                <span className="block text-base font-bold text-white leading-tight">Otahuhu Printing</span>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-brand-400">Custom T-Shirts · Auckland</span>
              </div>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-400">
              Auckland&apos;s local custom print shop. Perfect for events, businesses,
              churches, clubs, sports teams, and gifts.
            </p>
            <div className="mt-5 flex gap-3">
              {['Facebook', 'Instagram'].map((s) => (
                <span key={s} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-white/10 cursor-pointer transition-colors">
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Shop links */}
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Shop</h3>
            <ul className="space-y-2.5 text-sm">
              {[
                { href: '/products', label: 'All Products' },
                { href: '/products', label: 'T-Shirts' },
                { href: '/products', label: 'Custom Hoodies' },
                { href: '/#how-it-works', label: 'How It Works' },
              ].map(({ href, label }) => (
                <li key={label}>
                  <Link href={href} className="hover:text-white transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support links */}
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Support</h3>
            <ul className="space-y-2.5 text-sm">
              {[
                { href: '#', label: 'Sizing Guide' },
                { href: '#', label: 'File Requirements' },
                { href: '#', label: 'Shipping Info' },
                { href: '#', label: 'Contact Us' },
              ].map(({ href, label }) => (
                <li key={label}>
                  <Link href={href} className="hover:text-white transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-xl bg-white/5 p-4">
              <p className="text-xs font-medium text-white">📍 Otahuhu, Auckland</p>
              <p className="mt-1 text-xs text-gray-400">Mon–Fri 8am–6pm</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-gray-500 sm:flex-row sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} Otahuhu Printing Shop. All rights reserved.</p>
          <div className="flex items-center gap-1">
            <span className="rounded-md bg-white/5 px-2 py-1">VISA</span>
            <span className="rounded-md bg-white/5 px-2 py-1">Mastercard</span>
            <span className="rounded-md bg-white/5 px-2 py-1">PayPal</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
