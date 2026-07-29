'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useCartStore } from '@/features/cart/cart-store'
import { useCartPricing } from '@/features/cart/useCartPricing'
import { buildCartProductGroups } from '@/features/cart/cart-grouping'
import { CartProductGroupCard } from '@/components/cart/CartProductGroupCard'

export default function CartPage() {
  const { items, removeItem, updateQuantity } = useCartStore()
  const {
    pricingByKey,
    errorsByKey,
    groupTotals,
    groupKeyByItemKey,
    subtotal: recalcSubtotal,
    error: pricingError,
    errorKind,
    loading: pricingLoading,
    isComplete: pricingComplete,
    canRetry,
    retry,
  } = useCartPricing(items)

  // Presentation-only projection (Jira 10102): grouped by product identity, one child row per source
  // cart line. Derived at render time from the live items + the current quotes — nothing extra is
  // persisted, the `items` array is never reordered, and the checkout payload is untouched.
  const tierQuantityByKey = useMemo(() => {
    const byKey: Record<string, number | undefined> = {}
    for (const item of items) {
      byKey[item.cartItemKey] = groupTotals[groupKeyByItemKey[item.cartItemKey]]
    }
    return byKey
  }, [items, groupTotals, groupKeyByItemKey])

  const productGroups = useMemo(
    () => buildCartProductGroups(items, { pricingByKey, errorsByKey, tierQuantityByKey }),
    [items, pricingByKey, errorsByKey, tierQuantityByKey],
  )

  // Every mutation resolves its target by cartItemKey only — never by colour, size, row index or
  // product id — so a grouped row can never affect a neighbouring line.
  function handleIncrease(cartItemKey: string) {
    const item = items.find((i) => i.cartItemKey === cartItemKey)
    if (!item) return
    updateQuantity(cartItemKey, item.quantity + 1)
  }

  function handleDecrease(cartItemKey: string) {
    const item = items.find((i) => i.cartItemKey === cartItemKey)
    if (!item) return
    updateQuantity(cartItemKey, item.quantity - 1)
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 py-32 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-black/[0.04]">
          <CartIcon className="h-10 w-10 text-black/25" />
        </div>
        <h2 className="text-2xl text-black" style={{ fontWeight: 400, letterSpacing: '-0.96px' }}>Your cart is empty</h2>
        <p className="mt-2 text-base text-black/50" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
          Add some custom T-shirts to get started.
        </p>
        <Link href="/products" className="btn-black mt-8">
          Browse Products
        </Link>
      </div>
    )
  }

  const subtotal = recalcSubtotal

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-black/[0.08]">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
          <nav className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
            <Link href="/" className="hover:text-black transition-colors">Home</Link>
            <span>/</span>
            <span className="text-black">Cart</span>
          </nav>
          <h1 className="text-2xl text-black" style={{ fontWeight: 400, letterSpacing: '-0.96px' }}>
            Your Cart
            <span className="ml-2 text-base text-black/50" style={{ fontWeight: 400, letterSpacing: '-0.14px' }}>
              ({items.length} item{items.length !== 1 ? 's' : ''})
            </span>
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {productGroups.map((group) => (
              <CartProductGroupCard
                key={group.groupKey}
                group={group}
                onIncrease={handleIncrease}
                onDecrease={handleDecrease}
                onRemove={removeItem}
              />
            ))}

            {pricingError && (
              <div
                role="alert"
                className={`rounded-lg border px-4 py-3 text-sm ${
                  errorKind === 'rate-limit'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                <p>{pricingError}</p>
                {canRetry && (
                  <button type="button" onClick={retry} className="mt-2 underline">
                    Retry pricing
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Link href="/products"
                className="flex items-center gap-1 text-sm text-black/50 hover:text-black transition-colors"
                style={{ letterSpacing: '-0.14px' }}>
                Back to products
              </Link>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-24 card overflow-hidden">
              <div className="border-b border-black/[0.08] px-6 py-4">
                <h2 className="text-base text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                  Order Summary
                </h2>
              </div>
              <div className="space-y-3 p-6">
                <div className="flex justify-between text-sm" style={{ letterSpacing: '-0.14px' }}>
                  <span className="text-black/50">Subtotal ({items.length} item{items.length !== 1 ? 's' : ''})</span>
                  <span className="text-black" style={{ fontWeight: 480 }}>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm" style={{ letterSpacing: '-0.14px' }}>
                  <span className="text-black/50">Shipping</span>
                  <span className="text-green-600" style={{ fontWeight: 480 }}>
                    {subtotal >= 100 ? 'FREE' : 'Calculated at checkout'}
                  </span>
                </div>
                {subtotal < 100 && (
                  <div className="rounded-lg bg-black/[0.03] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
                    Add <strong>${(100 - subtotal).toFixed(2)}</strong> more for free shipping
                  </div>
                )}
                <div className="border-t border-black/[0.08] pt-3">
                  <div className="flex justify-between">
                    <span className="text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>Total</span>
                    <span className="text-xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
                      ${subtotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-6 pb-6">
                {pricingComplete ? (
                  <Link href="/checkout" className="btn-black w-full justify-center">
                    Proceed to Checkout
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="btn-black w-full cursor-not-allowed justify-center opacity-50"
                  >
                    {pricingLoading ? 'Refreshing prices…' : 'Pricing unavailable'}
                  </button>
                )}
                <div className="mt-4 flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
                  <span>Secure checkout</span>
                  <span>-</span>
                  <span>NZ wide shipping</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  )
}
