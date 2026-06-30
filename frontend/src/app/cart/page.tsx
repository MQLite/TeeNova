'use client'

import Link from 'next/link'
import { useCartStore } from '@/features/cart/cart-store'
import { tierHint, useCartPricing } from '@/features/cart/useCartPricing'
import type { CartItem } from '@/types'

function getPrintSummary(item: CartItem) {
  return item.prints ?? []
}

function getUploadedDesignUrl(item: CartItem) {
  // Badge carries its design at item level; garments carry it per-print.
  return item.uploadedAssetUrl ?? item.prints?.find((print) => print.uploadedAssetUrl)?.uploadedAssetUrl
}

export default function CartPage() {
  const { items, removeItem, updateQuantity } = useCartStore()
  const { pricingByKey, errorsByKey, groupTotals, groupKeyByItemKey, subtotal: recalcSubtotal, error: pricingError } =
    useCartPricing(items)

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
            {items.map((item, idx) => {
              const linePricing = pricingByKey[item.cartItemKey]
              const lineError = errorsByKey[item.cartItemKey]
              const unitPrice = linePricing?.unitPrice ?? item.unitPrice
              const lineTotal = linePricing?.lineTotal ?? item.unitPrice * item.quantity
              const groupKey = groupKeyByItemKey[item.cartItemKey]
              const groupQuantity = (groupKey ? groupTotals[groupKey] : undefined) ?? item.quantity
              const hint = tierHint(linePricing, groupQuantity)
              const isBadge = item.kind === 'Badge'
              return (
              <div key={item.cartItemKey} className="card overflow-hidden">
                <div className="flex gap-4 p-5">
                  <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/[0.03]">
                    {getUploadedDesignUrl(item) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getUploadedDesignUrl(item) ?? ''}
                        alt="design"
                        className="h-full w-full object-contain p-1"
                      />
                    ) : (
                      <svg viewBox="0 0 200 220" className="h-10 w-10 text-black/[0.08]" fill="currentColor">
                        <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
                      </svg>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                          {item.productName}
                        </h3>
                        {isBadge ? (
                          <>
                            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                              Badge · {item.quantity} pcs
                            </p>
                            {(getUploadedDesignUrl(item) || item.designNote) && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                <span className="inline-flex flex-col rounded-lg border border-black/[0.08] px-2 py-1 text-[10px] text-black/55">
                                  {getUploadedDesignUrl(item) && <span className="text-green-600">Design uploaded</span>}
                                  {item.designNote && <span className="normal-case tracking-normal text-black/45">{item.designNote}</span>}
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {item.variantLabel && (
                              <p className="mt-0.5 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
                                {item.variantLabel}
                              </p>
                            )}
                            {getPrintSummary(item).length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {getPrintSummary(item).map((print) => (
                                  <span key={`${print.printAreaId}:${print.printSizeId}`}
                                    className="inline-flex flex-col rounded-lg border border-black/[0.08] px-2 py-1 text-[10px] text-black/55">
                                    {print.printAreaName} - {print.printSizeName}
                                    {print.uploadedAssetUrl && <span className="text-green-600">Design uploaded</span>}
                                    {print.designNote && <span className="normal-case tracking-normal text-black/45">{print.designNote}</span>}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => removeItem(item.cartItemKey)}
                        className="flex-shrink-0 rounded-full p-1.5 text-black/25 transition-colors hover:bg-red-50 hover:text-red-500"
                        title="Remove"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-0 rounded-full border border-black/[0.10]">
                        <button
                          className="px-3 py-1.5 text-base text-black/50 transition-colors hover:text-black"
                          onClick={() => updateQuantity(item.cartItemKey, item.quantity - 1)}
                        >-</button>
                        <span className="min-w-[2rem] text-center text-sm text-black" style={{ fontWeight: 480 }}>
                          {item.quantity}
                        </span>
                        <button
                          className="px-3 py-1.5 text-base text-black/50 transition-colors hover:text-black"
                          onClick={() => updateQuantity(item.cartItemKey, item.quantity + 1)}
                        >+</button>
                      </div>
                      <span className="text-base text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                        ${lineTotal.toFixed(2)}
                      </span>
                    </div>

                    {/* Badge price breakdown: a single quantity-tier unit price (Jira 9504). */}
                    {isBadge && linePricing && !lineError && (
                      <div className="mt-3 space-y-1 rounded-lg bg-black/[0.02] px-3 py-2 text-xs text-black/60">
                        <div className="flex items-center justify-between" style={{ letterSpacing: '-0.14px' }}>
                          <span>Unit price</span>
                          <span className="text-black/75">${linePricing.unitPrice.toFixed(2)}</span>
                        </div>
                        {linePricing.appliedTierMinQuantity != null && (
                          <div className="flex items-center justify-between" style={{ letterSpacing: '-0.14px' }}>
                            <span>Quantity tier</span>
                            <span className="text-black/75">{linePricing.appliedTierMinQuantity}+</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Print-only price breakdown: fixed garment + summed print prices (Jira 9207) */}
                    {!isBadge && linePricing && !lineError && (
                      <div className="mt-3 space-y-1 rounded-lg bg-black/[0.02] px-3 py-2 text-xs text-black/60">
                        <div className="flex items-center justify-between" style={{ letterSpacing: '-0.14px' }}>
                          <span>Garment</span>
                          <span className="text-black/75">${linePricing.garmentUnitPrice.toFixed(2)}</span>
                        </div>
                        {linePricing.prints.map((print) => (
                          <div
                            key={`${print.printAreaId}:${print.printSizeId}`}
                            className="flex items-center justify-between"
                            style={{ letterSpacing: '-0.14px' }}
                          >
                            <span>{print.printAreaName} - {print.printSizeName} <span className="text-black/40">print</span></span>
                            <span className="text-black/75">${print.resolvedUnitPrintPrice.toFixed(2)}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between border-t border-black/[0.06] pt-1" style={{ letterSpacing: '-0.14px' }}>
                          <span className="text-black/75" style={{ fontWeight: 480 }}>Unit total</span>
                          <span className="text-black" style={{ fontWeight: 540 }}>${unitPrice.toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    {/* Print volume tier note (garment only) */}
                    {!isBadge && linePricing && !lineError && linePricing.pricingMode === 'Tiered' && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {linePricing.appliedTierMinQuantity != null && (
                          <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.54px] text-black/55">
                            Print volume price: {linePricing.appliedTierMinQuantity <= 1 ? '1 pc' : `${linePricing.appliedTierMinQuantity}+`}
                          </span>
                        )}
                        <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.54px] text-black/55">
                          Group quantity: {groupQuantity}
                        </span>
                        {hint && (
                          <span className="text-[11px] text-black/45" style={{ letterSpacing: '-0.14px' }}>
                            {hint}
                          </span>
                        )}
                      </div>
                    )}

                    {lineError && (
                      <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" style={{ letterSpacing: '-0.14px' }}>
                        <p>{lineError}</p>
                        <p className="mt-1 text-red-600">
                          This print option may no longer be available for the selected size. Please remove this item and add it again.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-black/[0.06] bg-black/[0.02] px-5 py-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                    Item {idx + 1} of {items.length}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/50">
                    ${unitPrice.toFixed(2)} each
                  </span>
                </div>
              </div>
              )
            })}

            {pricingError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {pricingError}
              </p>
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
                <Link href="/checkout" className="btn-black w-full justify-center">
                  Proceed to Checkout
                </Link>
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
