'use client'

// Sub-navigation for the Payment Settings area (Jira 9908.1).
//
// Renders links to the four dedicated routes (Overview / Test / Live / Runtime) and highlights the
// active one. Every route is readable by both Admin and Viewer, so no link is role-gated here — the
// backend and each page's write controls are the real authorization boundary. Presentational only:
// no write logic, no form state, no data fetching. Works on direct entry and hard refresh because it
// derives the active link from usePathname().

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/admin/settings/payments',         label: 'Overview', exact: true },
  { href: '/admin/settings/payments/test',    label: 'Test Mode', exact: false },
  { href: '/admin/settings/payments/live',    label: 'Live Mode', exact: false },
  { href: '/admin/settings/payments/runtime', label: 'Runtime Mode', exact: false },
]

export function PaymentSettingsNavigation() {
  const pathname = usePathname()

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav aria-label="Payment settings" className="flex flex-wrap gap-1.5 rounded-xl border border-black/[0.08] bg-black/[0.02] p-1.5">
      {links.map(({ href, label, exact }) => {
        const active = isActive(href, exact)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={[
              'rounded-lg px-3.5 py-1.5 text-sm transition-colors',
              active
                ? 'bg-black text-white shadow-sm'
                : 'text-black/55 hover:bg-black/[0.05] hover:text-black',
            ].join(' ')}
            style={{ letterSpacing: '-0.14px' }}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
