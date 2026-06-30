'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCartStore } from '@/features/cart/cart-store'
import { useCartPricing } from '@/features/cart/useCartPricing'
import { ordersApi } from '@/api/orders'
import { Button } from '@/components/ui/Button'
import { PaymentRequirementSummary } from '@/components/checkout/PaymentRequirementSummary'
import type { CartItem, DeliveryMethod, PaymentProvider, ShippingAddress } from '@/types'

function getPrintSummary(item: CartItem) {
  return item.prints ?? []
}

function getUploadedDesignUrl(item: CartItem) {
  // Badge carries its design at item level; garments carry it per-print.
  return item.uploadedAssetUrl ?? item.prints?.find((print) => print.uploadedAssetUrl)?.uploadedAssetUrl
}

type SubmitPhase = 'idle' | 'creating-order' | 'creating-session' | 'redirecting'

const PROVIDER_OPTIONS: { value: PaymentProvider; label: string }[] = [
  { value: 'Stripe',   label: 'Stripe'   },
  { value: 'Windcave', label: 'Windcave' },
  { value: 'Poli',     label: 'POLi'     },
  { value: 'PayPal',   label: 'PayPal'   },
]

export default function CheckoutPage() {
  const router = useRouter()
  const { items, clearCart } = useCartStore()
  const {
    pricingByKey,
    subtotal: recalcSubtotal,
    isComplete: pricingComplete,
    loading: pricingLoading,
    error: pricingError,
  } = useCartPricing(items)
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null)
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('Pickup')
  const [paymentMethod, setPaymentMethod] = useState<'manual' | 'online'>('manual')
  const [onlineProvider, setOnlineProvider] = useState<PaymentProvider>('Stripe')

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

  const isSubmitting = submitPhase !== 'idle'

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
    if (isSubmitting || submitted) return

    // Never submit on stale/unknown prices: require a clean, fresh recalculation first.
    if (pricingLoading || !pricingComplete) {
      setError(
        pricingError ??
          'Prices are still updating. Please wait for the order summary to finish refreshing before placing your order.',
      )
      return
    }

    setSubmitPhase('creating-order')
    setError(null)
    setSessionError(null)

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
        // Badge sends item-level design + no variant + no prints; garment unchanged (Jira 9504).
        // Neither path sends price fields — the backend is the sole pricing authority.
        items: items.map((item) =>
          item.kind === 'Badge'
            ? {
                productId: item.productId,
                quantity: item.quantity,
                uploadedAssetId: item.uploadedAssetId,
                uploadedAssetUrl: item.uploadedAssetUrl,
                designNote: item.designNote,
              }
            : {
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
              },
        ),
        deliveryMethod,
      })

      // Order created: prevent re-submission and cart-empty redirect before clearing.
      setSubmitted(true)
      clearCart()

      if (paymentMethod === 'manual') {
        router.push(`/checkout/success?orderId=${order.id}`)
        return
      }

      // Online payment: create a hosted checkout session then redirect.
      setSubmitPhase('creating-session')
      try {
        const session = await ordersApi.createOnlinePaymentSession(order.id, { provider: onlineProvider })
        setSubmitPhase('redirecting')
        window.location.href = session.providerCheckoutUrl
        // Navigation initiated: do not reset submitPhase.
      } catch (sessionErr) {
        setSessionError(
          sessionErr instanceof Error
            ? sessionErr.message
            : 'The online payment session could not be created. Your order has been placed; you can arrange payment manually with the shop.',
        )
        setCreatedOrderId(order.id)
        setSubmitPhase('idle')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setSubmitPhase('idle')
    }
  }

  function getSubmitLabel(): string {
    if (submitPhase === 'creating-order')   return 'Creating order...'
    if (submitPhase === 'creating-session') return 'Creating payment session...'
    if (submitPhase === 'redirecting')      return 'Redirecting to payment...'
    return paymentMethod === 'online' ? 'Place Order & Continue to Payment' : 'Place Order'
  }

  if (items.length === 0 && !submitted) {
    return null
  }

  const subtotal = recalcSubtotal

  // Address is optional only for manual payment + pickup (walk-in / phone orders). Name + email
  // stay required. Online payment or shipping delivery still requires a full address.
  const addressOptional = paymentMethod === 'manual' && deliveryMethod === 'Pickup'

  return (
    <div className="min-h-screen bg-white">
      {/* Header bar */}
      <div className="border-b border-black/[0.08]">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
          <nav className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
            <Link href="/" className="hover:text-black transition-colors">Home</Link>
            <span>/</span>
            <Link href="/cart" className="hover:text-black transition-colors">Cart</Link>
            <span>/</span>
            <span className="text-black">Checkout</span>
          </nav>
          <h1 className="text-2xl text-black" style={{ fontWeight: 400, letterSpacing: '-0.96px' }}>Checkout</h1>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">

            {/* Left: Form */}
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
                    {addressOptional && (
                      <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/40">
                        (optional)
                      </span>
                    )}
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
                  {addressOptional && (
                    <p className="sm:col-span-2 text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>
                      Address is optional for pickup orders paid manually. You can leave it blank.
                    </p>
                  )}
                  <Field label="Full Name" name="fullName" value={form.fullName} onChange={handleChange} required placeholder="Jane Smith" className="sm:col-span-2" />
                  <Field label={addressOptional ? 'Address Line 1 (optional)' : 'Address Line 1'} name="addressLine1" value={form.addressLine1} onChange={handleChange} required={!addressOptional} placeholder="123 Main Street" className="sm:col-span-2" />
                  <Field label="Address Line 2 (optional)" name="addressLine2" value={form.addressLine2 ?? ''} onChange={handleChange} placeholder="Apt, suite, unit..." className="sm:col-span-2" />
                  <Field label={addressOptional ? 'City (optional)' : 'City'} name="city" value={form.city} onChange={handleChange} required={!addressOptional} placeholder="Auckland" />
                  <Field label="Region / State (optional)" name="state" value={form.state} onChange={handleChange} placeholder="Auckland" />
                  <Field label={addressOptional ? 'Postcode (optional)' : 'Postcode'} name="postalCode" value={form.postalCode} onChange={handleChange} required={!addressOptional} placeholder="1010" />
                  <Field label={addressOptional ? 'Country (optional)' : 'Country'} name="country" value={form.country} onChange={handleChange} required={!addressOptional} placeholder="NZ" />
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

                  {/* Payment method selection */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {([
                      {
                        value: 'manual' as const,
                        title: 'Manual Payment',
                        lines: [
                          'Place the order now and arrange payment with the shop.',
                          deliveryMethod === 'Pickup'
                            ? 'Pickup orders require a deposit before processing.'
                            : 'Shipping orders require full payment before processing.',
                        ],
                      },
                      {
                        value: 'online' as const,
                        title: 'Online Payment',
                        lines: [
                          'Place the order and continue to a secure hosted payment page.',
                          'Your payment will be confirmed after the provider processes it.',
                        ],
                      },
                    ]).map(({ value, title, lines }) => {
                      const selected = paymentMethod === value
                      return (
                        <label
                          key={value}
                          className={[
                            'cursor-pointer rounded-xl border-2 p-4 transition-colors',
                            selected
                              ? 'border-black bg-black/[0.02]'
                              : 'border-black/[0.10] hover:border-black/25',
                          ].join(' ')}
                        >
                          <input
                            type="radio"
                            name="paymentMethod"
                            value={value}
                            checked={selected}
                            onChange={() => setPaymentMethod(value)}
                            className="sr-only"
                          />
                          <p
                            className="text-sm text-black"
                            style={{ fontWeight: selected ? 540 : 480, letterSpacing: '-0.14px' }}
                          >
                            {title}
                          </p>
                          {lines.map((line, i) => (
                            <p key={i} className="mt-0.5 text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>
                              {line}
                            </p>
                          ))}
                        </label>
                      )
                    })}
                  </div>

                  {/* Provider selector: shown only when Online is selected */}
                  {paymentMethod === 'online' && (
                    <div className="rounded-xl border border-black/[0.08] bg-black/[0.01] p-4">
                      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
                        Payment Provider
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {PROVIDER_OPTIONS.map(({ value, label }) => {
                          const selected = onlineProvider === value
                          return (
                            <label
                              key={value}
                              className={[
                                'cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors',
                                selected
                                  ? 'border-black bg-black text-white'
                                  : 'border-black/[0.15] text-black hover:border-black/40',
                              ].join(' ')}
                            >
                              <input
                                type="radio"
                                name="onlineProvider"
                                value={value}
                                checked={selected}
                                onChange={() => setOnlineProvider(value)}
                                className="sr-only"
                              />
                              <span style={{ fontWeight: selected ? 540 : 480, letterSpacing: '-0.14px' }}>
                                {label}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                      <p className="mt-3 text-xs text-black/45" style={{ letterSpacing: '-0.14px' }}>
                        Do not close the page until you are redirected back. Payment confirmation happens after the provider processes your payment.
                      </p>
                    </div>
                  )}

                  <PaymentRequirementSummary
                    mode="checkout"
                    deliveryMethod={deliveryMethod}
                    totalAmount={subtotal}
                  />
                </div>
              </div>

              {/* Order creation error */}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Session creation error */}
              {sessionError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-2">
                  <p>{sessionError}</p>
                  {createdOrderId && (
                    <Link
                      href={`/checkout/success?orderId=${createdOrderId}`}
                      className="inline-block underline"
                    >
                      View your order and payment instructions
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Right: Order Summary */}
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
                          {item.kind === 'Badge' ? `Badge - x${item.quantity}` : `${item.variantLabel ?? ''} - x${item.quantity}`}
                        </p>
                        {item.kind === 'Badge' ? (
                          (getUploadedDesignUrl(item) || item.designNote) && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              <span className="inline-flex flex-col rounded-lg border border-black/[0.08] px-2 py-1 text-[10px] text-black/50">
                                {getUploadedDesignUrl(item) && <span className="text-green-600">Design uploaded</span>}
                                {item.designNote && <span className="normal-case tracking-normal text-black/45">{item.designNote}</span>}
                              </span>
                            </div>
                          )
                        ) : (
                          getPrintSummary(item).length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {getPrintSummary(item).map((print) => (
                                <span key={`${print.printAreaId}:${print.printSizeId}`}
                                  className="inline-flex flex-col rounded-lg border border-black/[0.08] px-2 py-1 text-[10px] text-black/50">
                                  {print.printAreaName} - {print.printSizeName}
                                  {print.uploadedAssetUrl && <span className="text-green-600">Design uploaded</span>}
                                  {print.designNote && <span className="normal-case tracking-normal text-black/45">{print.designNote}</span>}
                                </span>
                              ))}
                            </div>
                          )
                        )}
                      </div>
                      <span className="text-sm text-black" style={{ fontWeight: 480 }}>
                        ${(pricingByKey[item.cartItemKey]?.lineTotal ?? item.unitPrice * item.quantity).toFixed(2)}
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
                  {pricingLoading && (
                    <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/40">
                      Updating prices...
                    </p>
                  )}
                  {pricingError && (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" style={{ letterSpacing: '-0.14px' }}>
                      {pricingError}
                    </p>
                  )}
                </div>

                <div className="px-5 pb-5">
                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    loading={isSubmitting}
                    disabled={isSubmitting || pricingLoading || !pricingComplete || (submitted && !!sessionError)}
                  >
                    {getSubmitLabel()}
                  </Button>
                  <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.54px] text-black/40">
                    {paymentMethod === 'online'
                      ? "You'll be redirected to a secure hosted payment page"
                      : 'Payment arranged after order submission'}
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
