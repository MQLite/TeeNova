'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useCartStore } from '@/features/cart/cart-store'

export function Header() {
  const totalItems = useCartStore((s) => s.totalItems())
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-black/[0.08]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black transition-opacity group-hover:opacity-80">
            <TShirtIcon />
          </div>
          <span
            className="text-base text-black"
            style={{ fontWeight: 540, letterSpacing: '-0.26px' }}
          >
            Otahuhu Printing
          </span>
        </Link>

        {/* Nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {[
            { href: '/products', label: 'Products' },
            { href: '/#how-it-works', label: 'How It Works' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-full px-4 py-2 text-sm text-black/60 transition-colors hover:bg-black/[0.05] hover:text-black"
              style={{ letterSpacing: '-0.14px' }}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link
            href="/products"
            className="btn-black btn-sm hidden sm:inline-flex"
          >
            Start Designing
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
        </div>
      </div>
    </header>
  )
}

function TShirtIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="white" className="h-4 w-4">
      <path d="M6 2L2 6l3 2v12h14V8l3-2-4-4s-1 2-4 2-4-2-4-2H6z" />
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
