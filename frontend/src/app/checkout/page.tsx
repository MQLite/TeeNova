'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCartStore } from '@/features/cart/cart-store'
import { ordersApi } from '@/api/orders'
import { Button } from '@/components/ui/Button'
import { PaymentRequirementSummary } from '@/components/checkout/PaymentRequirementSummary'
import type { CartItem, DeliveryMethod, ShippingAddress } from '@/types'

function getPrintSummary(item: CartItem) {
  return item.prints ?? []
}

function getUploadedDesignUrl(item: CartItem) {
  return item.prints?.find((print) => print.uploadedAssetUrl)?.uploadedAssetUrl
}

export default function CheckoutPage() {
  const router = useRouter()
  const { items, clearCart, totalPrice } = useCartStore()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('Pickup')

  const [form, setForm] = useState<ShippingAddress & { email: string }>({
    email: '',
    fullName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'NZ',
    phone: '',
  })

  useEffect(() => {
    if (items.length === 0 && !submitted) {
      router.replace('/cart')
    }
  }, [items.length, router, submitted])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const order = await ordersApi.create({
        customerEmail: form.email,
        shippingAddress: {
          fullName: form.fullName,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2 || undefined,
          city: form.city,
          state: form.state,
          postalCode: form.postalCode,
          country: form.country,
          phone: form.phone || undefined,
        },
        items: items.map((item) => ({
          productId: item.productId,
          productVariantId: item.productVariantId,
          quantity: item.quantity,
          prints: (item.prints ?? []).map((print) => ({
            printAreaId: print.printAreaId,
            printSizeId: print.printSizeId,
            uploadedAssetId: print.uploadedAssetId,
            uploadedAssetUrl: print.uploadedAssetUrl,
            designNote: print.designNote,
          })),
        })),
        deliveryMethod,
      })
      setSubmitted(true)
      clearCart()
      router.push(`/checkout/success?orderId=${order.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (items.length === 0 && !submitted) {
    return null
  }

  const subtotal = totalPrice()

  return (
    <div className="min-h-screen bg-white">
      {/* Header bar */}
      <div className="border-b border-black/[0.08]">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
          <nav className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
            <Link href="/" className="hover:text-black transition-colors">Home</Link>
            <span>›</span>
            <Link href="/cart" className="hover:text-black transition-colors">Cart</Link>
            <span>›</span>
            <span className="text-black">Checkout</span>
          </nav>
          <h1 className="text-2xl text-black" style={{ fontWeight: 400, letterSpacing: '-0.96px' }}>Checkout</h1>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">

            {/* ── Left: Form ── */}
            <div className="space-y-6 lg:col-span-2">

              {/* Step 1: Contact */}
              <div className="card overflow-hidden">
                <div className="border-b border-black/[0.08] bg-black/[0.02] px-6 py-4 flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs font-medium text-white">1</span>
                  <h2 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                    Contact Information
                  </h2>
                </div>
                <div className="p-6">
                  <Field label="Email Address" name="email" type="email" value={form.email} onChange={handleChange} required placeholder="you@example.com" />
                </div>
              </div>

              {/* Step 2: Delivery Method */}
              <div className="card overflow-hidden">
                <div className="border-b border-black/[0.08] bg-black/[0.02] px-6 py-4 flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs font-medium text-white">2</span>
                  <h2 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                    Delivery Method
                  </h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {([
                      { method: 'Pickup'   as DeliveryMethod, title: 'Pick Up',  desc: 'Collect your order from our shop. Deposit required.' },
                      { method: 'Shipping' as DeliveryMethod, title: 'Shipping', desc: 'Delivered to your address. Full payment required.' },
                    ] as const).map(({ method, title, desc }) => {
                      const selected = deliveryMethod === method
                      return (
                        <label
                          key={method}
                          className={[
                            'cursor-pointer rounded-xl border-2 p-4 transition-colors',
                            selected
                              ? 'border-black bg-black/[0.02]'
                              : 'border-black/[0.10] hover:border-black/25',
                          ].join(' ')}
                        >
                          <input
                            type="radio"
                            name="deliveryMethod"
                            value={method}
                            checked={selected}
                            onChange={() => setDeliveryMethod(method)}
                            className="sr-only"
                          />
                          <p
                            className="text-sm text-black"
                            style={{ fontWeight: selected ? 540 : 480, letterSpacing: '-0.14px' }}
                          >
                            {title}
                          </p>
                          <p className="mt-0.5 text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>
                            {desc}
                          </p>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Step 3: Address */}
              <div className="card overflow-hidden">
                <div className="border-b border-black/[0.08] bg-black/[0.02] px-6 py-4 flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs font-medium text-white">3</span>
                  <h2 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                    {deliveryMethod === 'Pickup' ? 'Contact Address' : 'Shipping Address'}
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
                  <Field label="Full Name" name="fullName" value={form.fullName} onChange={handleChange} required placeholder="Jane Smith" className="sm:col-span-2" />
                  <Field label="Address Line 1" name="addressLine1" value={form.addressLine1} onChange={handleChange} required placeholder="123 Main Street" className="sm:col-span-2" />
                  <Field label="Address Line 2 (optional)" name="addressLine2" value={form.addressLine2 ?? ''} onChange={handleChange} placeholder="Apt, suite, unit…" className="sm:col-span-2" />
                  <Field label="City" name="city" value={form.city} onChange={handleChange} required placeholder="Auckland" />
                  <Field label="Region / State (optional)" name="state" value={form.state} onChange={handleChange} placeholder="Auckland" />
                  <Field label="Postcode" name="postalCode" value={form.postalCode} onChange={handleChange} required placeholder="1010" />
                  <Field label="Country" name="country" value={form.country} onChange={handleChange} required placeholder="NZ" />
                  <Field label="Phone (optional)" name="phone" type="tel" value={form.phone ?? ''} onChange={handleChange} placeholder="+64 21 000 0000" className="sm:col-span-2" />
                </div>
              </div>

              {/* Step 4: Payment */}
              <div className="card overflow-hidden">
                <div className="border-b border-black/[0.08] bg-black/[0.02] px-6 py-4 flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs font-medium text-white">4</span>
                  <h2 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                    Payment
                  </h2>
                </div>
                <div className="space-y-4 p-6">
                  <div
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                    style={{ letterSpacing: '-0.14px' }}
                  >
                    Online payment is not available yet. After submitting your order, please follow the payment instructions and we will confirm your order once payment is received.
                  </div>
                  <PaymentRequirementSummary
                    mode="checkout"
                    deliveryMethod={deliveryMethod}
                    totalAmount={subtotal}
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            {/* ── Right: Order Summary ── */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 card overflow-hidden">
                <div className="border-b border-black/[0.08] bg-black/[0.02] px-6 py-4">
                  <h2 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>Order Summary</h2>
                  <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/50 mt-0.5">
                    {items.length} item{items.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Items */}
                <div className="max-h-56 overflow-y-auto divide-y divide-black/[0.06]">
                  {items.map((item) => (
                    <div key={item.cartItemKey} className="flex gap-3 px-5 py-3">
                      <div className="h-11 w-11 flex-shrink-0 rounded-lg overflow-hidden bg-black/[0.03] flex items-center justify-center">
                        {getUploadedDesignUrl(item) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={getUploadedDesignUrl(item) ?? ''} alt="" className="h-full w-full object-contain p-0.5" />
                        ) : (
                          <svg viewBox="0 0 200 220" className="h-6 w-6 text-black/[0.08]" fill="currentColor">
                            <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-black truncate" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                          {item.productName}
                        </p>
                        <p className="text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>
                          {item.variantLabel} · ×{item.quantity}
                        </p>
                        {getPrintSummary(item).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {getPrintSummary(item).map((print) => (
                              <span key={`${print.printAreaId}:${print.printSizeId}`}
                                className="inline-flex flex-col rounded-lg border border-black/[0.08] px-2 py-1 text-[10px] text-black/50">
                                {print.printAreaName} · {print.printSizeName}
                                {print.uploadedAssetUrl && <span className="text-green-600">Design uploaded</span>}
                                {print.designNote && <span className="normal-case tracking-normal text-black/45">{print.designNote}</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-sm text-black" style={{ fontWeight: 480 }}>
                        ${(item.unitPrice * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="border-t border-black/[0.08] p-5 space-y-2.5">
                  <div className="flex justify-between text-sm" style={{ letterSpacing: '-0.14px' }}>
                    <span className="text-black/50">Subtotal</span>
                    <span className="text-black" style={{ fontWeight: 480 }}>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm" style={{ letterSpacing: '-0.14px' }}>
                    <span className="text-black/50">Shipping</span>
                    <span className="text-green-600" style={{ fontWeight: 480 }}>
                      {deliveryMethod === 'Pickup' ? 'N/A' : subtotal >= 100 ? 'FREE' : 'TBC'}
                    </span>
                  </div>
                  <div className="border-t border-black/[0.08] pt-2.5 flex justify-between">
                    <span className="text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>Total</span>
                    <span className="text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
                      ${subtotal.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="px-5 pb-5">
                  <Button type="submit" className="w-full" size="lg" loading={submitting}>
                    {submitting ? 'Placing Order…' : 'Place Order →'}
                  </Button>
                  <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.54px] text-black/40">
                    Payment arranged after order submission
                  </p>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  name: string
}

function Field({ label, className, ...props }: FieldProps) {
  return (
    <div className={className}>
      <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">{label}</label>
      <input className="form-input" {...props} />
    </div>
  )
}
