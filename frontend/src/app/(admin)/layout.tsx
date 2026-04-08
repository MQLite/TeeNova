import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { template: '%s | Admin — Otahuhu Printing', default: 'Admin — Otahuhu Printing' },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 border-r border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="border-b border-gray-100 px-5 py-5">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
                <svg viewBox="0 0 24 24" fill="white" className="h-4 w-4">
                  <path d="M6 2L2 6l3 2v12h14V8l3-2-4-4s-1 2-4 2-4-2-4-2H6z" />
                </svg>
              </div>
              <div>
                <span className="block text-sm font-bold text-gray-900 leading-tight">Otahuhu Printing</span>
                <span className="block text-[9px] font-semibold uppercase tracking-wider text-brand-600">Admin Panel</span>
              </div>
            </Link>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-0.5">
            <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Management</p>
            {[
              { href: '/admin/orders', label: 'Orders', icon: '📋' },
              { href: '/admin/products', label: 'Products', icon: '👕' },
            ].map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-brand-50 hover:text-brand-700 transition-colors"
              >
                <span>{icon}</span>
                {label}
              </Link>
            ))}
          </nav>

          {/* Bottom */}
          <div className="border-t border-gray-100 p-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-xs text-gray-500 hover:text-brand-600 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Storefront
            </Link>
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
