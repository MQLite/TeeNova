'use client'

import { formatMoneyNZD } from '@/lib/pricing'
import type { HeroPriceInfo } from '@/lib/pricing'

interface PriceAdjustment {
  size: string
  adjustment: number
}

interface Props {
  /** Derived display-only hero price (see resolveHeroPrintPrice). */
  heroInfo: HeroPriceInfo
  /** Fixed garment "from" price (base + cheapest variant adjustment), or null. */
  garmentFromPrice: number | null
  /** Product base price — used for the garment "From" label when no cheaper adjustment exists. */
  basePrice: number
  /** Per-size garment price adjustments to surface as a compact secondary line. */
  priceAdjustments: PriceAdjustment[]
  className?: string
}

/**
 * Conversion-focused hero price message (Jira 9303). A static "from/reference" message derived from
 * existing pricing data — NOT the live selected price (that stays in PricingBreakdownPanel). It leads
 * with the combined "A3 printing + garment" reference price and always tells the customer the exact
 * price updates below. Cleanly degrades to printed-from and garment-only messaging when print-tier
 * data is missing; never fabricates a number.
 */
export function ProductHeroPrice({ heroInfo, garmentFromPrice, basePrice, priceAdjustments, className }: Props) {
  const garmentLabel =
    garmentFromPrice !== null && garmentFromPrice !== basePrice
      ? `From ${formatMoneyNZD(garmentFromPrice)}`
      : formatMoneyNZD(basePrice)

  // Only claim a hard "Minimum 10 pieces" when the resolved break is literally a 10+ tier; otherwise
  // frame it as a reference quantity so we never imply a minimum the pricing data does not support.
  const quantityCopy =
    heroInfo.tierMinQuantity === 10
      ? '(Minimum 10 pieces)'
      : `Reference price for ${heroInfo.quantity} ${heroInfo.quantity === 1 ? 'piece' : 'pieces'}`

  const adjustmentsLine = priceAdjustments.length > 0 && (
    <p className="mt-1 eyebrow text-ink-muted">
      {priceAdjustments.map((item) => `${item.size}: +$${item.adjustment.toFixed(2)}`).join(' | ')}
    </p>
  )

  const updatesNote = (
    <p className="mt-2 text-sm text-ink-muted">
      Your exact price updates below.
    </p>
  )

  // Print-reference modes: lead with the combined garment + print "from" price.
  if ((heroInfo.mode === 'preferred' || heroInfo.mode === 'fallback-print-size') && heroInfo.price !== null) {
    return (
      <div className={className}>
        <p className="mt-4 eyebrow text-ink-muted">
          Garment + print · from
        </p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-5xl text-ink" style={{ fontWeight: 400, letterSpacing: '-1.2px' }}>
            {formatMoneyNZD(heroInfo.price)}
          </span>
          <span className="text-sm text-ink-muted">ea</span>
        </div>
        <p className="mt-1 text-sm text-ink" style={{ fontWeight: 500 }}>
          {heroInfo.label}
        </p>
        <p className="mt-0.5 eyebrow text-ink-muted">
          {quantityCopy}
        </p>
        {updatesNote}
        <p className="mt-2 eyebrow text-ink-muted">
          Garment {garmentLabel} ea{priceAdjustments.length > 0 ? ' · varies by size' : ''}
        </p>
        {adjustmentsLine}
      </div>
    )
  }

  // Printed-from mode: tiers exist but no group-default ladder resolved.
  if (heroInfo.mode === 'printed-from' && heroInfo.price !== null) {
    return (
      <div className={className}>
        <p className="mt-4 eyebrow text-ink-muted">
          Printed from
        </p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-5xl text-ink" style={{ fontWeight: 400, letterSpacing: '-1.2px' }}>
            {formatMoneyNZD(heroInfo.price)}
          </span>
          <span className="text-sm text-ink-muted">ea</span>
        </div>
        <p className="mt-1 text-sm text-ink" style={{ fontWeight: 500 }}>
          {heroInfo.label}
        </p>
        {updatesNote}
        <p className="mt-2 eyebrow text-ink-muted">
          Garment {garmentLabel} ea{priceAdjustments.length > 0 ? ' · varies by size' : ''}
        </p>
        {adjustmentsLine}
      </div>
    )
  }

  // Garment-only / unavailable: no print-tier data — show the garment "from" price, never a print price.
  return (
    <div className={className}>
      <p className="mt-4 eyebrow text-ink-muted">
        Garment price
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-5xl text-ink" style={{ fontWeight: 400, letterSpacing: '-1.2px' }}>
          {garmentLabel}
        </span>
        <span className="text-sm text-ink-muted">
          {priceAdjustments.length > 0 ? 'ea · varies by size' : 'ea'}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Garment price only. Print price updates when options are selected.
      </p>
      {adjustmentsLine}
    </div>
  )
}
