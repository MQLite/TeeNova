'use client'

import type { DeliveryMethod, ShippingAddress } from '@/types'

interface Props {
  deliveryMethod: DeliveryMethod | null
  shippingAddress: ShippingAddress
  customerNote?: string | null
}

function PickupIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
    </svg>
  )
}

function ShippingIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M8.25 18.75V14.25m8.25 4.5V7.5M3.75 9H14.25" />
    </svg>
  )
}

export function FulfillmentPanel({ deliveryMethod, shippingAddress, customerNote }: Props) {
  const isPickup = deliveryMethod === 'Pickup'
  const isShipping = deliveryMethod === 'Shipping' || deliveryMethod === null

  return (
    <div className="card p-5 space-y-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">Fulfillment</p>

      {/* Delivery method pill */}
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.54px] ${
          isPickup
            ? 'border border-teal-200 bg-teal-50 text-teal-700'
            : 'border border-sky-200 bg-sky-50 text-sky-700'
        }`}>
          {isPickup ? <PickupIcon /> : <ShippingIcon />}
          {isPickup ? 'Store Pickup' : 'Shipping'}
        </span>
      </div>

      {/* Pickup instructions */}
      {isPickup && (
        <div className="rounded-lg border border-teal-100 bg-teal-50/50 px-3.5 py-3">
          <p className="text-sm text-teal-800" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
            Customer will collect from store
          </p>
          <p className="mt-0.5 text-xs text-teal-600" style={{ letterSpacing: '-0.14px' }}>
            Notify customer when order is marked Ready.
          </p>
        </div>
      )}

      {/* Shipping address */}
      {isShipping && (
        <div>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">
            Ship to
          </p>
          <address className="not-italic space-y-0.5 text-sm text-black/60" style={{ letterSpacing: '-0.14px' }}>
            <p className="text-black" style={{ fontWeight: 480 }}>{shippingAddress.fullName}</p>
            <p>{shippingAddress.addressLine1}</p>
            {shippingAddress.addressLine2 && <p>{shippingAddress.addressLine2}</p>}
            <p>
              {shippingAddress.city}
              {shippingAddress.state ? `, ${shippingAddress.state}` : ''}
              {shippingAddress.postalCode ? ` ${shippingAddress.postalCode}` : ''}
            </p>
            <p className="text-black/45">{shippingAddress.country}</p>
            {shippingAddress.phone && (
              <p className="pt-0.5 text-black/55">{shippingAddress.phone}</p>
            )}
          </address>
        </div>
      )}

      {/* Customer note */}
      {customerNote && (
        <div className="border-t border-black/[0.06] pt-3">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Customer Note</p>
          <p className="text-sm leading-relaxed text-black/60" style={{ letterSpacing: '-0.14px' }}>
            {customerNote}
          </p>
        </div>
      )}
    </div>
  )
}
