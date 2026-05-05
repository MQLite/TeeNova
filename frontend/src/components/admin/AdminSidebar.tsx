'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  {
    href: '/admin',
    label: 'Dashboard',
    exact: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
        <path d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 10a3.001 3.001 0 01-2 2.83V14a1 1 0 11-2 0v-1.17A3.001 3.001 0 017 10a3 3 0 013-3z" />
      </svg>
    ),
  },
  {
    href: '/admin/orders',
    label: 'Orders',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: '/admin/products',
    label: 'Products',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
        <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: '/admin/print-config',
    label: 'Print Config',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
        <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 102 0v-2h6v2a1 1 0 102 0v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 3h6V4H7v3zm-1 9a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: '/admin/assets',
    label: 'Assets',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
      </svg>
    ),
  },
]

export function AdminSidebar() {
  const pathname = usePathname()

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-black/[0.08] bg-[#fcfcfc]">
      {/* Brand */}
      <div className="border-b border-black/[0.08] px-4 py-4">
        <Link href="/admin" className="group flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black">
            <svg viewBox="0 0 24 24" fill="white" className="h-3.5 w-3.5">
              <path d="M6 2L2 6l3 2v12h14V8l3-2-4-4s-1 2-4 2-4-2-4-2H6z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
              Otahuhu Printing
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.54px] text-black/55">Admin Panel</p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="mb-1.5 px-2 font-mono text-[9px] uppercase tracking-[0.54px] text-black/45">
          Management
        </p>
        {navItems.map(({ href, label, icon, exact }) => {
          const active = isActive(href, exact)
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center gap-2.5 rounded-[50px] px-3 py-2.5 text-sm transition-all',
                active
                  ? 'bg-black text-white shadow-sm'
                  : 'text-black/50 hover:bg-black/[0.05] hover:text-black hover:translate-x-[1px]',
              ].join(' ')}
              style={{ letterSpacing: '-0.14px' }}
            >
              <span className={active ? 'text-white' : 'text-black/50'}>{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Back link */}
      <div className="border-t border-black/[0.08] px-2.5 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-[50px] px-3 py-2 text-xs text-black/55 transition-colors hover:bg-black/[0.05] hover:text-black"
          style={{ letterSpacing: '-0.14px' }}
        >
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Storefront
        </Link>
      </div>
    </aside>
  )
}
