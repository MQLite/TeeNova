'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useCartStore } from '@/features/cart/cart-store'

// Public nav links (Jira 9604). Concise service-shop set. `external` renders a plain <a> (the shop
// mailto quote pattern); the rest are internal routes or homepage in-page anchors. The same list
// drives desktop and mobile so they never drift apart.
const NAV_LINKS: { href: string; label: string; external?: boolean }[] = [
  { href: '/products', label: 'Products' },
  { href: '/#what-we-print', label: 'Services' },
  { href: '/#how-it-works', label: 'How It Works' },
  { href: '/contact', label: 'Contact' },
  { href: 'mailto:otahuhuprint@gmail.com', label: 'Request a Quote', external: true },
]

export function Header() {
  const totalItems = useCartStore((s) => s.totalItems())
  const [mounted, setMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => setMounted(true), [])

  // Close the mobile menu on Escape for reasonable keyboard behavior.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-black/[0.08]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group" onClick={() => setMenuOpen(false)}>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black transition-opacity group-hover:opacity-80">
            <PrintIcon />
          </div>
          <span
            className="text-base text-black"
            style={{ fontWeight: 540, letterSpacing: '-0.26px' }}
          >
            Otahuhu Printing
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(({ href, label, external }) =>
            external ? (
              <a
                key={label}
                href={href}
                className="rounded-full px-4 py-2 text-sm text-black/60 transition-colors hover:bg-black/[0.05] hover:text-black"
                style={{ letterSpacing: '-0.14px' }}
              >
                {label}
              </a>
            ) : (
              <Link
                key={label}
                href={href}
                className="rounded-full px-4 py-2 text-sm text-black/60 transition-colors hover:bg-black/[0.05] hover:text-black"
                style={{ letterSpacing: '-0.14px' }}
              >
                {label}
              </Link>
            ),
          )}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link
            href="/products"
            className="btn-black btn-sm hidden sm:inline-flex"
          >
            Browse Products
          </Link>

          <Link
            href="/cart"
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-black/60 transition-colors hover:bg-black/[0.05] hover:text-black"
            title="Cart"
          >
            <CartIcon />
            {mounted && totalItems > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[9px] font-medium text-white">
                {totalItems > 9 ? '9+' : totalItems}
              </span>
            )}
          </Link>

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            className="flex h-9 w-9 items-center justify-center rounded-full text-black/60 transition-colors hover:bg-black/[0.05] hover:text-black md:hidden"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Mobile nav panel */}
      {menuOpen && (
        <nav
          id="mobile-nav"
          className="border-t border-black/[0.08] bg-white px-4 py-3 sm:px-6 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map(({ href, label, external }) =>
              external ? (
                <a
                  key={label}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-2xl px-4 py-3 text-sm text-black/70 transition-colors hover:bg-black/[0.05] hover:text-black"
                  style={{ letterSpacing: '-0.14px' }}
                >
                  {label}
                </a>
              ) : (
                <Link
                  key={label}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-2xl px-4 py-3 text-sm text-black/70 transition-colors hover:bg-black/[0.05] hover:text-black"
                  style={{ letterSpacing: '-0.14px' }}
                >
                  {label}
                </Link>
              ),
            )}
            <Link
              href="/products"
              onClick={() => setMenuOpen(false)}
              className="btn-black btn-sm mt-1 w-full justify-center"
            >
              Browse Products
            </Link>
          </div>
        </nav>
      )}
    </header>
  )
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.75} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V3h12v6M6 18H4a1 1 0 01-1-1v-5a2 2 0 012-2h14a2 2 0 012 2v5a1 1 0 01-1 1h-2M8 14h8v7H8v-7z" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
