'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useCartStore } from '@/features/cart/cart-store'

export function Header() {
  const totalItems = useCartStore((s) => s.totalItems())
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur-md shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 shadow-sm group-hover:bg-brand-700 transition-colors">
            <TShirtIcon />
          </div>
          <div className="hidden sm:block">
            <span className="block text-base font-bold leading-tight text-gray-900">Otahuhu Printing</span>
            <span className="block text-[10px] font-medium uppercase tracking-wider text-brand-600">Custom T-Shirts</span>
          </div>
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
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link
            href="/products"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shadow-sm"
          >
            Start Designing
          </Link>

          <Link
            href="/cart"
            className="relative flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            title="Cart"
          >
            <CartIcon />
            {mounted && totalItems > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white ring-2 ring-white">
                {totalItems > 99 ? '99+' : totalItems}
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
    <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5">
      <path d="M6 2L2 6l3 2v12h14V8l3-2-4-4s-1 2-4 2-4-2-4-2H6z" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  )
}
