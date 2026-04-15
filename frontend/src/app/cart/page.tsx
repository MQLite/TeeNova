'use client'

import Link from 'next/link'
import { useCartStore } from '@/features/cart/cart-store'
import { Button } from '@/components/ui/Button'

export default function CartPage() {
  const { items, removeItem, updateQuantity, totalPrice } = useCartStore()

  if (items.length === 0) {
    return (
      <div className="bg-gray-50 min-h-screen">
        <div className="mx-auto max-w-2xl px-4 py-32 text-center sm:px-6">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-brand-50">
            <svg className="h-12 w-12 text-brand-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Your cart is empty</h2>
          <p className="mt-2 text-gray-500">Add some custom T-shirts to get started.</p>
          <Button className="mt-8" size="lg" asChild>
            <Link href="/products">Browse Products</Link>
          </Button>
        </div>
      </div>
    )
  }

  const subtotal = totalPrice()

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="bg-white border-b border-gray-100">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <nav className="mb-1 flex items-center gap-2 text-xs text-gray-500">
            <Link href="/" className="hover:text-brand-600">Home</Link>
            <span>/</span>
            <span className="font-medium text-gray-900">Cart</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900">
            Your Cart
            <span className="ml-2 text-base font-normal text-gray-400">({items.length} item{items.length !== 1 ? 's' : ''})</span>
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {items.map((item, idx) => (
              <div key={item.productVariantId} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <div className="flex gap-4 p-5">
                  <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-50 to-purple-50">
                    {item.printPositions?.[0]?.uploadedAssetUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.printPositions[0].uploadedAssetUrl}
                        alt="design"
                        className="h-full w-full object-contain p-1"
                      />
                    ) : (
                      <svg viewBox="0 0 200 220" className="h-10 w-10 text-brand-300" fill="currentColor">
                        <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
                      </svg>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="truncate font-semibold text-gray-900">{item.productName}</h3>
                        <p className="mt-0.5 text-sm text-gray-500">{item.variantLabel}</p>
                        {item.printPositions && item.printPositions.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.printPositions.map((pp) => (
                              <span key={pp.position} className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                                Position {pp.position.replace(/([A-Z])/g, ' $1').trim()}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <button
                        onClick={() => removeItem(item.productVariantId)}
                        className="flex-shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                        title="Remove"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50">
                        <button
                          className="px-3 py-1.5 text-base font-bold text-gray-600 transition-colors hover:text-gray-900"
                          onClick={() => updateQuantity(item.productVariantId, item.quantity - 1)}
                        >-</button>
                        <span className="min-w-[2rem] text-center text-sm font-semibold text-gray-900">{item.quantity}</span>
                        <button
                          className="px-3 py-1.5 text-base font-bold text-gray-600 transition-colors hover:text-gray-900"
                          onClick={() => updateQuantity(item.productVariantId, item.quantity + 1)}
                        >+</button>
                      </div>
                      <span className="text-base font-bold text-gray-900">
                        ${(item.unitPrice * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-gray-50 bg-gray-50 px-5 py-2">
                  <span className="text-xs text-gray-400">Item {idx + 1} of {items.length}</span>
                  <span className="text-xs text-gray-500">${item.unitPrice.toFixed(2)} each</span>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-2">
              <Link href="/products" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
                Back to products
              </Link>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-24 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-6 py-4">
                <h2 className="text-base font-bold text-gray-900">Order Summary</h2>
              </div>
              <div className="space-y-3 p-6">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal ({items.length} item{items.length !== 1 ? 's' : ''})</span>
                  <span className="font-semibold">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Shipping</span>
                  <span className="font-medium text-green-600">
                    {subtotal >= 100 ? 'FREE' : 'Calculated at checkout'}
                  </span>
                </div>
                {subtotal < 100 && (
                  <div className="rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-700">
                    Add <strong>${(100 - subtotal).toFixed(2)}</strong> more for free shipping!
                  </div>
                )}
                <div className="border-t border-gray-100 pt-3">
                  <div className="flex justify-between">
                    <span className="font-bold text-gray-900">Total</span>
                    <span className="text-xl font-extrabold text-brand-600">${subtotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="px-6 pb-6">
                <Button className="w-full" size="lg" asChild>
                  <Link href="/checkout">Proceed to Checkout</Link>
                </Button>
                <div className="mt-4 flex items-center justify-center gap-3 text-xs text-gray-400">
                  <span>Secure checkout</span>
                  <span>|</span>
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
