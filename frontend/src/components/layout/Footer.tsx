import Link from 'next/link'
import { BrandMark } from '@/components/brand/BrandMark'
import { publicContentHref, publishedDocuments } from '@/lib/public-content/registry'
import { socialProfileLinks } from '@/lib/seo/social-profiles'
import { publishedServices, serviceHref } from '@/lib/service-content/registry'
import { brandFullName } from '@/lib/site-brand'
import { approvedBusinessFacts } from '@/lib/site-business'
import { businessPhone, phoneHref, quoteFormEnabled, quoteHref } from '@/lib/site-contact'

// Footer link lists (Jira 9604). `external: true` renders a plain <a> for the shop mailto quote/contact
// pattern; everything else is an existing internal route or homepage anchor. No dead "#" links.
type FooterLink = { href: string; label: string; external?: boolean }

// Service links are derived from the published-service registry (Jira 10306). Before that, four of
// these were `mailto:` links and one pointed at the unfinished `/customize` Design Studio
// placeholder. Deriving them means a Draft service cannot be linked from here by being forgotten in
// a second list, and there is no service link that does not resolve to a real published page.
const SERVICE_LINKS: FooterLink[] = [
  ...publishedServices().map((service) => ({
    href: serviceHref(service),
    label: service.name,
  })),
  { href: '/services', label: 'All services' },
]

const SUPPORT_LINKS: FooterLink[] = [
  { href: '/products', label: 'Browse Products' },
  { href: '/#how-it-works', label: 'How It Works' },
  { href: quoteHref(), label: 'Request a Quote', external: !quoteFormEnabled },
  { href: '/contact', label: 'Contact Us' },
]

/** Verified, configured profile URLs only — the same source JSON-LD `sameAs` reads. */
const SOCIAL_LINKS = socialProfileLinks()

const HELP_AND_POLICY_LINKS: FooterLink[] = publishedDocuments().map((document) => ({
  href: publicContentHref(document),
  label: document.title,
}))

function FooterLinkItem({ href, label, external }: FooterLink) {
  const className =
    'inline-flex min-h-9 items-center text-ink-inverse-secondary transition-colors duration-fast hover:text-ink-inverse hover:underline'
  return (
    <li>
      {external ? (
        <a href={href} className={className}>
          {label}
        </a>
      ) : (
        <Link href={href} className={className}>
          {label}
        </Link>
      )}
    </li>
  )
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      {/* h2 keeps the footer's heading order below any page h1 without competing
          with page section headings. */}
      <h2 className="eyebrow eyebrow-inverse mb-4">{title}</h2>
      {children}
    </div>
  )
}

/**
 * Public footer (Jira 10307 presentation pass).
 *
 * Content rules from earlier tasks are unchanged and must stay that way: no
 * payment-method badges (Jira 10303 removed "Bank Transfer / Cash / Eftpos"), no
 * shipping or turnaround claim, no Draft policy link, no customer logos, and
 * published-registry-derived service and help links only.
 *
 * Contrast note: footer link text moved from `text-white/55` — roughly 3.9:1 on
 * the black band, below AA at body size — to `--ink-inverse-secondary` at 0.86,
 * measured in `design-tokens.test.ts`.
 */
export function Footer() {
  const businessFacts = approvedBusinessFacts()

  return (
    <footer className="surface-inverse">
      <div className="section-container py-14 sm:py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <BrandMark tone="light" />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-ink-inverse-secondary">
              Auckland&apos;s local custom print shop — T-shirts, badges, banners, business cards,
              stickers, signage and more. Perfect for events, businesses, churches, clubs and teams.
            </p>
            {/* Social profiles (Jira 10308). This was the sentence "Find us on Facebook and
                Instagram" with no link behind it — a claim the site could not act on. It now renders
                only verified, configured profile URLs, from the same module that feeds JSON-LD
                `sameAs`, so the visible links and the machine-readable ones cannot disagree. With
                nothing configured — the state today, approvals A27/A28/A39/A40 — nothing is
                rendered at all: no chip, no inert label, no `#`. */}
            {SOCIAL_LINKS.length > 0 && (
              <nav aria-label="Social profiles" className="mt-5">
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {SOCIAL_LINKS.map((link) => (
                    <li key={link.platform}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-9 items-center text-ink-inverse-secondary transition-colors duration-fast hover:text-ink-inverse hover:underline"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>

          {/* Services — omitted entirely rather than rendered empty when nothing is published. */}
          {SERVICE_LINKS.length > 1 && (
            <FooterColumn title="Services">
              <ul className="space-y-1 text-sm">
                {SERVICE_LINKS.map((link) => (
                  <FooterLinkItem key={link.label} {...link} />
                ))}
              </ul>
            </FooterColumn>
          )}

          {/* Support */}
          <FooterColumn title="Support">
            <ul className="space-y-1 text-sm">
              {SUPPORT_LINKS.map((link) => (
                <FooterLinkItem key={link.label} {...link} />
              ))}
            </ul>
          </FooterColumn>

          {/* Local info. Address and opening hours remain pending owner approval (Jira 10300
              A05/A08), so they are presented as the shop's own details to check, not as a
              guaranteed service commitment — and no pickup, delivery or turnaround promise is
              attached to them. */}
          <FooterColumn title={businessFacts.address ? 'Visit Us' : 'Contact'}>
            <div className="card-inverse p-4">
              {/* Address and hours read from the one NAP module (Jira 10308); the strings are
                  unchanged. Writing them out here as well is how the site ended up with the same
                  address in four files. */}
              {businessFacts.address && (
                <p className="text-xs font-medium text-ink-inverse">
                  {businessFacts.address.singleLine}
                </p>
              )}
              {businessFacts.openingHours?.map((row) => (
                <p key={row.label} className="mt-1 text-xs text-ink-inverse-secondary first:mt-1">
                  {row.label} {row.display}
                </p>
              ))}
              {/* Verified click-to-call number from the shared contact configuration. */}
              {businessPhone && phoneHref && (
                <p className="mt-2 text-xs">
                  <a
                    href={phoneHref}
                    className="inline-flex min-h-9 items-center text-ink-inverse-secondary transition-colors duration-fast hover:text-ink-inverse hover:underline"
                  >
                    {businessPhone}
                  </a>
                </p>
              )}
              <p className="mt-2 text-xs text-ink-inverse-secondary">
                Ask us which pickup or delivery options are available for your job.
              </p>
            </div>
          </FooterColumn>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-line-inverse">
        <div className="section-container flex flex-col items-center justify-between gap-3 py-5 text-xs sm:flex-row">
          <p className="text-ink-inverse-muted">
            © {new Date().getFullYear()} {brandFullName}. All rights reserved.
          </p>
          {/* Help and policy links (Jira 10303). Published documents only — the registry is the
              authority, so an unapproved policy page can never be linked from here. This replaced
              the "Bank Transfer / Cash / Eftpos" badges, which asserted an unverified set of
              accepted payment methods and contradicted the online card payment checkout offers. */}
          {HELP_AND_POLICY_LINKS.length > 0 && (
            <nav aria-label="Help and policies">
              <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
                {HELP_AND_POLICY_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-9 items-center text-ink-inverse-secondary transition-colors duration-fast hover:text-ink-inverse hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </div>
    </footer>
  )
}
