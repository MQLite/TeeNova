import Link from 'next/link'

// Footer link lists (Jira 9604). `external: true` renders a plain <a> for the shop mailto quote/contact
// pattern; everything else is an existing internal route or homepage anchor. No dead "#" links, and no
// links to /contact, /location, or /quote (those pages don't exist yet — deferred to Jira 9605).
type FooterLink = { href: string; label: string; external?: boolean }

const SERVICE_LINKS: FooterLink[] = [
  { href: '/products', label: 'T-Shirt & Garment Printing' },
  { href: '/customize', label: 'Bring Your Own Garment' },
  { href: '/products', label: 'Custom Badges' },
  { href: 'mailto:otahuhuprint@gmail.com', label: 'Banners & Pull-Ups', external: true },
  { href: 'mailto:otahuhuprint@gmail.com', label: 'Business Cards', external: true },
  { href: 'mailto:otahuhuprint@gmail.com', label: 'Stickers & Labels', external: true },
  { href: 'mailto:otahuhuprint@gmail.com', label: 'Signs & Corflute', external: true },
]

const SUPPORT_LINKS: FooterLink[] = [
  { href: '/products', label: 'Browse Products' },
  { href: '/#how-it-works', label: 'How It Works' },
  { href: 'mailto:otahuhuprint@gmail.com', label: 'Request a Quote', external: true },
  { href: '/contact', label: 'Contact Us' },
]

function FooterLinkItem({ href, label, external }: FooterLink) {
  return (
    <li>
      {external ? (
        <a href={href} className="hover:text-white transition-colors">{label}</a>
      ) : (
        <Link href={href} className="hover:text-white transition-colors">{label}</Link>
      )}
    </li>
  )
}

export function Footer() {
  return (
    <footer className="bg-black text-white/55">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-5">

          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.75} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V3h12v6M6 18H4a1 1 0 01-1-1v-5a2 2 0 012-2h14a2 2 0 012 2v5a1 1 0 01-1 1h-2M8 14h8v7H8v-7z" />
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
              Auckland&apos;s local custom print shop — T-shirts, badges, banners, business cards,
              stickers, signage and more. Perfect for events, businesses, churches, clubs and teams.
            </p>
            <div className="mt-5 flex gap-2">
              {['Facebook', 'Instagram'].map((s) => (
                <span key={s}
                  className="rounded-full border border-white/10 px-4 py-1.5 text-xs text-white/50"
                  style={{ letterSpacing: '0.02em' }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Services */}
          <div>
            <h3 className="mb-4 font-mono text-[11px] font-normal uppercase tracking-[0.54px] text-white/30">
              Services
            </h3>
            <ul className="space-y-2.5 text-sm" style={{ letterSpacing: '-0.14px' }}>
              {SERVICE_LINKS.map((link) => (
                <FooterLinkItem key={link.label} {...link} />
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="mb-4 font-mono text-[11px] font-normal uppercase tracking-[0.54px] text-white/30">
              Support
            </h3>
            <ul className="space-y-2.5 text-sm" style={{ letterSpacing: '-0.14px' }}>
              {SUPPORT_LINKS.map((link) => (
                <FooterLinkItem key={link.label} {...link} />
              ))}
            </ul>
          </div>

          {/* Local info */}
          <div>
            <h3 className="mb-4 font-mono text-[11px] font-normal uppercase tracking-[0.54px] text-white/30">
              Visit Us
            </h3>
            <div className="rounded-lg border border-white/[0.08] p-4">
              <p className="text-xs font-medium text-white">Otahuhu, Auckland</p>
              <p className="mt-1 text-xs" style={{ letterSpacing: '-0.14px' }}>Mon–Fri 8am–6pm</p>
              <p className="mt-2 text-xs" style={{ letterSpacing: '-0.14px' }}>
                Pickup in Otahuhu or NZ-wide delivery.
              </p>
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
            {['Bank Transfer', 'Cash', 'Eftpos'].map((p) => (
              <span key={p} className="rounded border border-white/10 px-2 py-1 text-[10px] text-white/40 tracking-wide">{p}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
