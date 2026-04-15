'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCartStore } from '@/features/cart/cart-store'
import { ordersApi } from '@/api/orders'
import { Button } from '@/components/ui/Button'
import type { ShippingAddress } from '@/types'

export default function CheckoutPage() {
  const router = useRouter()
  const { items, clearCart, totalPrice } = useCartStore()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          printPositions: (item.printPositions ?? []).map((p) => ({
            position: p.position,
            assetId: p.uploadedAssetId,
            assetUrl: p.uploadedAssetUrl,
            designNote: p.designNote,
          })),
        })),
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
    router.replace('/cart')
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

              {/* Contact */}
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

              {/* Shipping */}
              <div className="card overflow-hidden">
                <div className="border-b border-black/[0.08] bg-black/[0.02] px-6 py-4 flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs font-medium text-white">2</span>
                  <h2 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                    Shipping Address
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
                  <Field label="Full Name" name="fullName" value={form.fullName} onChange={handleChange} required placeholder="Jane Smith" className="sm:col-span-2" />
                  <Field label="Address Line 1" name="addressLine1" value={form.addressLine1} onChange={handleChange} required placeholder="123 Main Street" className="sm:col-span-2" />
                  <Field label="Address Line 2 (optional)" name="addressLine2" value={form.addressLine2 ?? ''} onChange={handleChange} placeholder="Apt, suite, unit…" className="sm:col-span-2" />
                  <Field label="City" name="city" value={form.city} onChange={handleChange} required placeholder="Auckland" />
                  <Field label="Region / State" name="state" value={form.state} onChange={handleChange} required placeholder="Auckland" />
                  <Field label="Postcode" name="postalCode" value={form.postalCode} onChange={handleChange} required placeholder="1010" />
                  <Field label="Country" name="country" value={form.country} onChange={handleChange} required placeholder="NZ" />
                  <Field label="Phone (optional)" name="phone" type="tel" value={form.phone ?? ''} onChange={handleChange} placeholder="+64 21 000 0000" className="sm:col-span-2" />
                </div>
              </div>

              {/* Payment placeholder */}
              <div className="card overflow-hidden">
                <div className="border-b border-black/[0.08] bg-black/[0.02] px-6 py-4 flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/[0.15] text-xs font-medium text-black/50">3</span>
                  <h2 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                    Payment
                  </h2>
                </div>
                <div className="p-6">
                  <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-black/[0.08] bg-black/[0.02] py-8 text-center">
                    <div className="flex gap-2">
                      {['VISA', 'MC', 'PayPal'].map(p => (
                        <span key={p} className="rounded border border-black/[0.10] bg-white px-2 py-1 font-mono text-xs font-normal uppercase tracking-[0.54px] text-black/55">
                          {p}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm text-black/50" style={{ letterSpacing: '-0.14px' }}>Payment integration</p>
                    <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Connect Stripe or another provider here</p>
                  </div>
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
                    <div key={item.productVariantId} className="flex gap-3 px-5 py-3">
                      <div className="h-11 w-11 flex-shrink-0 rounded-lg overflow-hidden bg-black/[0.03] flex items-center justify-center">
                        {item.printPositions?.[0]?.uploadedAssetUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.printPositions[0]?.uploadedAssetUrl ?? ''} alt="" className="h-full w-full object-contain p-0.5" />
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
                      {subtotal >= 100 ? 'FREE' : 'TBC'}
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
                  <div className="mt-3 flex items-center justify-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Secure & encrypted
                  </div>
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
