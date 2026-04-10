'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCartStore } from '@/features/cart/cart-store'
import { ordersApi } from '@/api/orders'
import { Button } from '@/components/ui/Button'
import type { PrintPosition, ShippingAddress } from '@/types'

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
          uploadedAssetId: item.uploadedAssetId,
          uploadedAssetUrl: item.uploadedAssetUrl,
          printPosition: item.printPosition as PrintPosition | undefined,
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
    <div className="bg-gray-50 min-h-screen">
      {/* Header bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Link href="/" className="hover:text-brand-600">Home</Link>
            <span>›</span>
            <Link href="/cart" className="hover:text-brand-600">Cart</Link>
            <span>›</span>
            <span className="text-gray-900 font-medium">Checkout</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">

            {/* ── Left: Form ── */}
            <div className="space-y-6 lg:col-span-2">

              {/* Contact */}
              <div className="rounded-2xl bg-white border border-gray-100  overflow-hidden">
                <div className="border-b border-gray-100 bg-gray-50 px-6 py-4 flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">1</span>
                  <h2 className="font-bold text-gray-900">Contact Information</h2>
                </div>
                <div className="p-6">
                  <Field label="Email Address" name="email" type="email" value={form.email} onChange={handleChange} required placeholder="you@example.com" />
                </div>
              </div>

              {/* Shipping */}
              <div className="rounded-2xl bg-white border border-gray-100  overflow-hidden">
                <div className="border-b border-gray-100 bg-gray-50 px-6 py-4 flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">2</span>
                  <h2 className="font-bold text-gray-900">Shipping Address</h2>
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
              <div className="rounded-2xl bg-white border border-gray-100  overflow-hidden">
                <div className="border-b border-gray-100 bg-gray-50 px-6 py-4 flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-white">3</span>
                  <h2 className="font-bold text-gray-900">Payment</h2>
                </div>
                <div className="p-6">
                  <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-8 text-center">
                    <div className="flex gap-2">
                      {['VISA', 'MC', 'PayPal'].map(p => (
                        <span key={p} className="rounded-md bg-white border border-gray-200 px-2 py-1 text-xs font-bold text-gray-400 shadow-sm">{p}</span>
                      ))}
                    </div>
                    <p className="text-sm font-medium text-gray-500">Payment integration</p>
                    <p className="text-xs text-gray-400">Connect Stripe or another provider here</p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                  ⚠️ {error}
                </div>
              )}
            </div>

            {/* ── Right: Order Summary ── */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 rounded-2xl bg-white border border-gray-100  overflow-hidden">
                <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
                  <h2 className="font-bold text-gray-900">Order Summary</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{items.length} item{items.length !== 1 ? 's' : ''}</p>
                </div>

                {/* Items */}
                <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
                  {items.map((item) => (
                    <div key={item.productVariantId} className="flex gap-3 px-5 py-3">
                      <div className="h-11 w-11 flex-shrink-0 rounded-lg overflow-hidden bg-brand-50 flex items-center justify-center">
                        {item.uploadedAssetUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.uploadedAssetUrl} alt="" className="h-full w-full object-contain p-0.5" />
                        ) : (
                          <svg viewBox="0 0 200 220" className="h-6 w-6 text-brand-200" fill="currentColor">
                            <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{item.productName}</p>
                        <p className="text-xs text-gray-500">{item.variantLabel} · ×{item.quantity}</p>
                      </div>
                      <span className="text-sm font-semibold">${(item.unitPrice * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="border-t border-gray-100 p-5 space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-semibold">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Shipping</span>
                    <span className="font-medium text-green-600">
                      {subtotal >= 100 ? 'FREE' : 'TBC'}
                    </span>
                  </div>
                  <div className="border-t border-gray-100 pt-2.5 flex justify-between">
                    <span className="font-bold text-gray-900">Total</span>
                    <span className="text-lg font-extrabold text-brand-600">${subtotal.toFixed(2)}</span>
                  </div>
                </div>

                <div className="px-5 pb-5">
                  <Button type="submit" className="w-full" size="lg" loading={submitting}>
                    {submitting ? 'Placing Order…' : 'Place Order →'}
                  </Button>
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-400">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Secure & encrypted checkout
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
      <label className="mb-1.5 block text-sm font-semibold text-gray-700">{label}</label>
      <input className="form-input" {...props} />
    </div>
  )
}
