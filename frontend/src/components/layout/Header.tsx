'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { BrandMark } from '@/components/brand/BrandMark'
import { Icon } from '@/components/ui/Icon'
import { useCartStore } from '@/features/cart/cart-store'
import { quoteFormEnabled, quoteHref } from '@/lib/site-contact'

// Public nav links (Jira 9604). Concise service-shop set. `external` renders a plain <a> (the shop
// mailto quote pattern); the rest are internal routes or homepage in-page anchors. The same list
// drives desktop and mobile so they never drift apart.
const NAV_LINKS: { href: string; label: string; external?: boolean }[] = [
  { href: '/products', label: 'Products' },
  // Points at the real service index since Jira 10306; it used to be a homepage anchor because no
  // service page existed.
  { href: '/services', label: 'Services' },
  { href: '/#how-it-works', label: 'How It Works' },
  { href: '/contact', label: 'Contact' },
  { href: quoteHref(), label: 'Request a Quote', external: !quoteFormEnabled },
]

/**
 * Public header (Jira 10307 presentation pass).
 *
 * Behaviour added in this task: current-page marking via `aria-current`, focus
 * returned to the toggle when the mobile menu closes, and a 44px hit area on
 * every control. Navigation targets, the quote feature-flag branch and the
 * Escape-to-close handler are unchanged.
 */
export function Header() {
  const totalItems = useCartStore((s) => s.totalItems())
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  useEffect(() => setMounted(true), [])

  // Close the mobile menu on Escape for reasonable keyboard behavior, and return focus to the
  // control that opened it rather than dropping the user at the top of the document.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        toggleRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  // Route-level current state. In-page anchors ("/#how-it-works") and the mailto quote fallback are
  // not routes, so they are never marked current.
  const isCurrent = (href: string, external?: boolean) =>
    !external && href.startsWith('/') && !href.includes('#') && pathname === href

  const linkClass = (current: boolean) =>
    `flex min-h-11 items-center rounded-pill px-3 text-sm transition-colors duration-fast ${
      current
        ? 'bg-surface-sunken font-medium text-ink'
        : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink'
    }`

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface">
      <div className="section-container flex items-center justify-between gap-3 py-2.5">
        <Link
          href="/"
          aria-label="Otahuhu Printing — home"
          className="shrink-0 rounded-pill transition-opacity duration-fast hover:opacity-80"
          onClick={() => setMenuOpen(false)}
        >
          <BrandMark className="[&>span:last-child]:hidden min-[400px]:[&>span:last-child]:block" />
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Main" className="hidden min-w-0 items-center gap-0.5 lg:flex">
          {NAV_LINKS.map(({ href, label, external }) => {
            const current = isCurrent(href, external)
            return external ? (
              <a key={label} href={href} className={linkClass(current)}>
                {label}
              </a>
            ) : (
              <Link
                key={label}
                href={href}
                aria-current={current ? 'page' : undefined}
                className={linkClass(current)}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          <Link href="/products" className="btn-black btn-sm hidden sm:inline-flex">
            Browse Products
          </Link>

          <Link
            href="/cart"
            aria-label={mounted && totalItems > 0 ? `Cart, ${totalItems} items` : 'Cart'}
            className="btn-icon relative flex text-ink-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
          >
            <Icon name="cart" />
            {mounted && totalItems > 0 && (
              <span
                aria-hidden="true"
                className="mono-sm absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-action px-1 text-[9px] text-action-ink"
              >
                {totalItems > 9 ? '9+' : totalItems}
              </span>
            )}
          </Link>

          {/* Mobile menu toggle */}
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            className="btn-icon flex text-ink-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-ink lg:hidden"
          >
            <Icon name={menuOpen ? 'close' : 'menu'} />
          </button>
        </div>
      </div>

      {/* Mobile nav panel */}
      {menuOpen && (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="border-t border-line bg-surface px-4 py-3 sm:px-6 lg:hidden"
        >
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map(({ href, label, external }) => {
              const current = isCurrent(href, external)
              const className = `flex min-h-11 items-center rounded-lg px-4 text-sm transition-colors duration-fast ${
                current
                  ? 'bg-surface-sunken font-medium text-ink'
                  : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink'
              }`
              return external ? (
                <a key={label} href={href} onClick={() => setMenuOpen(false)} className={className}>
                  {label}
                </a>
              ) : (
                <Link
                  key={label}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={current ? 'page' : undefined}
                  className={className}
                >
                  {label}
                </Link>
              )
            })}
            <Link
              href="/products"
              onClick={() => setMenuOpen(false)}
              className="btn-black btn-sm mt-2 w-full justify-center"
            >
              Browse Products
            </Link>
          </div>
        </nav>
      )}
    </header>
  )
}
