'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

const navItems = [
  {
    href: '/admin',
    label: 'Dashboard',
    exact: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 flex-shrink-0">
        <path d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 10a3.001 3.001 0 01-2 2.83V14a1 1 0 11-2 0v-1.17A3.001 3.001 0 017 10a3 3 0 013-3z" />
      </svg>
    ),
  },
  {
    href: '/admin/orders',
    label: 'Orders',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 flex-shrink-0">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: '/admin/products',
    label: 'Products',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 flex-shrink-0">
        <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: '/admin/assets',
    label: 'Assets',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 flex-shrink-0">
        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
      </svg>
    ),
  },
]

export function AdminSidebar() {
  const pathname = usePathname()

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <aside className="flex w-56 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
      {/* Brand */}
      <div className="border-b border-gray-100 px-4 py-4">
        <Link href="/admin" className="group flex items-center gap-2.5">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600 shadow-sm">
            <svg viewBox="0 0 24 24" fill="white" className="h-4 w-4">
              <path d="M6 2L2 6l3 2v12h14V8l3-2-4-4s-1 2-4 2-4-2-4-2H6z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-gray-900">Otahuhu Printing</p>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-brand-600">Admin Panel</p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-2.5 py-3">
        <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Management
        </p>
        {navItems.map(({ href, label, icon, exact }) => {
          const active = isActive(href, exact)
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )}
            >
              <span className={active ? 'text-brand-600' : 'text-gray-400'}>{icon}</span>
              {label}
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-500" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-100 px-2.5 py-3 space-y-1">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
        >
          <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Storefront
        </Link>
      </div>
    </aside>
  )
}
