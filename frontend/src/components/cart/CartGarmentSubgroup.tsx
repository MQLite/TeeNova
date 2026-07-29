'use client'

import {
  MISSING_VALUE_LABEL,
  type CartGarmentVisualSubgroup,
  type CartProductRow,
} from '@/features/cart/cart-grouping'
import { tierHint, type CartLinePricing } from '@/features/cart/useCartPricing'

interface Props {
  subgroup: CartGarmentVisualSubgroup<CartLinePricing>
  onIncrease: (cartItemKey: string) => void
  onDecrease: (cartItemKey: string) => void
  onRemove: (cartItemKey: string) => void
}

interface SharedTier {
  appliedTier: number | null
  groupQuantity: number
  hint: string | null
}

function sharedTierFor(rows: CartProductRow<CartLinePricing>[]): SharedTier | null {
  if (rows.length === 0 || rows.some((row) => !row.pricing || row.pricingError)) return null
  const first = rows[0]
  if (first.pricing?.pricingMode !== 'Tiered') return null
  const candidate: SharedTier = {
    appliedTier: first.pricing.appliedTierMinQuantity,
    groupQuantity: first.printTierQuantity,
    hint: tierHint(first.pricing, first.printTierQuantity),
  }
  return rows.every(
    (row) =>
      row.pricing?.pricingMode === 'Tiered' &&
      row.pricing.appliedTierMinQuantity === candidate.appliedTier &&
      row.printTierQuantity === candidate.groupQuantity &&
      tierHint(row.pricing, row.printTierQuantity) === candidate.hint,
  )
    ? candidate
    : null
}

export function CartGarmentSubgroup({ subgroup, onIncrease, onDecrease, onRemove }: Props) {
  const sharedTier = sharedTierFor(subgroup.rows)

  return (
    <section
      data-testid="garment-visual-subgroup"
      className="border-b border-black/[0.06] px-4 py-4 last:border-b-0 sm:px-5"
    >
      <h4 className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.14px' }}>
        {subgroup.colour ?? MISSING_VALUE_LABEL}
      </h4>
      <div className="mt-2 min-w-0 space-y-1">
        {subgroup.prints.length > 0 ? (
          subgroup.prints.map((print) => (
            <div
              key={`${print.printAreaId}:${print.printSizeId}:${print.uploadedAssetId ?? ''}:${print.uploadedAssetUrl ?? ''}:${print.designNote ?? ''}`}
              className="text-xs text-black/55"
              style={{ overflowWrap: 'anywhere', letterSpacing: '-0.14px' }}
            >
              <span className="text-black/70">
                {print.printAreaName || MISSING_VALUE_LABEL} · {print.printSizeName || MISSING_VALUE_LABEL}
              </span>
              {print.uploadedAssetUrl && <span className="text-green-600"> · Design uploaded</span>}
              {print.designNote && <span> — {print.designNote}</span>}
            </div>
          ))
        ) : (
          <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">
            No print placements
          </p>
        )}
      </div>

      {sharedTier && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {sharedTier.appliedTier != null && (
            <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.54px] text-black/55">
              Print volume price: {sharedTier.appliedTier <= 1 ? '1 pc' : `${sharedTier.appliedTier}+`}
            </span>
          )}
          <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.54px] text-black/55">
            Group quantity: {sharedTier.groupQuantity}
          </span>
          {sharedTier.hint && (
            <span className="text-[11px] text-black/45" style={{ letterSpacing: '-0.14px' }}>
              {sharedTier.hint}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 hidden md:block">
        <div className="grid grid-cols-[minmax(4rem,0.7fr)_minmax(7rem,1fr)_minmax(7rem,1fr)_minmax(7rem,1fr)_auto] gap-3 border-b border-black/[0.08] pb-2 font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">
          <span>Size</span>
          <span>Qty</span>
          <span className="text-right">Unit total</span>
          <span className="text-right">Line total</span>
          <span className="text-right">Actions</span>
        </div>
        <div className="divide-y divide-black/[0.06]">
          {subgroup.rows.map((row) => (
            <GarmentDesktopRow
              key={row.cartItemKey}
              row={row}
              sharedTier={sharedTier}
              onIncrease={onIncrease}
              onDecrease={onDecrease}
              onRemove={onRemove}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 divide-y divide-black/[0.06] md:hidden">
        {subgroup.rows.map((row) => (
          <GarmentMobileRow
            key={row.cartItemKey}
            row={row}
            sharedTier={sharedTier}
            onIncrease={onIncrease}
            onDecrease={onDecrease}
            onRemove={onRemove}
          />
        ))}
      </div>
    </section>
  )
}

function QuantityControl({
  row,
  onIncrease,
  onDecrease,
}: {
  row: CartProductRow<CartLinePricing>
  onIncrease: (cartItemKey: string) => void
  onDecrease: (cartItemKey: string) => void
}) {
  const label = `${row.colour ?? MISSING_VALUE_LABEL} / ${row.size ?? MISSING_VALUE_LABEL}`
  return (
    <div className="inline-flex items-center rounded-full border border-black/[0.10]">
      <button
        type="button"
        className="px-2.5 py-1 text-base text-black/50 hover:text-black"
        aria-label={`Decrease quantity of ${label}`}
        onClick={() => onDecrease(row.cartItemKey)}
      >
        -
      </button>
      <span className="min-w-[1.75rem] text-center text-sm text-black">{row.quantity}</span>
      <button
        type="button"
        className="px-2.5 py-1 text-base text-black/50 hover:text-black"
        aria-label={`Increase quantity of ${label}`}
        onClick={() => onIncrease(row.cartItemKey)}
      >
        +
      </button>
    </div>
  )
}

function RowStatus({
  row,
  sharedTier,
}: {
  row: CartProductRow<CartLinePricing>
  sharedTier: SharedTier | null
}) {
  if (row.pricingError) return <p className="mt-2 text-xs text-red-700">{row.pricingError}</p>
  if (!sharedTier && row.pricing?.pricingMode === 'Tiered') {
    const hint = tierHint(row.pricing, row.printTierQuantity)
    return (
      <p className="mt-2 text-[11px] text-black/45">
        Print volume {row.pricing.appliedTierMinQuantity ?? 1}+ · Group quantity {row.printTierQuantity}
        {hint ? ` · ${hint}` : ''}
      </p>
    )
  }
  return null
}

function GarmentDesktopRow({
  row,
  sharedTier,
  onIncrease,
  onDecrease,
  onRemove,
}: {
  row: CartProductRow<CartLinePricing>
  sharedTier: SharedTier | null
  onIncrease: (cartItemKey: string) => void
  onDecrease: (cartItemKey: string) => void
  onRemove: (cartItemKey: string) => void
}) {
  return (
    <div data-cart-item-key={row.cartItemKey} className="py-3">
      <div className="grid grid-cols-[minmax(4rem,0.7fr)_minmax(7rem,1fr)_minmax(7rem,1fr)_minmax(7rem,1fr)_auto] items-center gap-3 text-sm">
        <span style={{ fontWeight: 540 }}>{row.size ?? MISSING_VALUE_LABEL}</span>
        <QuantityControl row={row} onIncrease={onIncrease} onDecrease={onDecrease} />
        <span className="text-right">${row.unitPrice.toFixed(2)}</span>
        <span className="text-right" style={{ fontWeight: 540 }}>${row.lineTotal.toFixed(2)}</span>
        <button
          type="button"
          className="justify-self-end text-xs text-red-600 hover:text-red-800"
          aria-label={`Remove ${row.colour ?? ''} / ${row.size ?? ''}`}
          onClick={() => onRemove(row.cartItemKey)}
        >
          Delete
        </button>
      </div>
      <RowStatus row={row} sharedTier={sharedTier} />
    </div>
  )
}

function GarmentMobileRow({
  row,
  sharedTier,
  onIncrease,
  onDecrease,
  onRemove,
}: {
  row: CartProductRow<CartLinePricing>
  sharedTier: SharedTier | null
  onIncrease: (cartItemKey: string) => void
  onDecrease: (cartItemKey: string) => void
  onRemove: (cartItemKey: string) => void
}) {
  return (
    <div data-testid={`cart-row-${row.cartItemKey}`} className="py-3 first:pt-1 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-black" style={{ fontWeight: 540 }}>
          Size {row.size ?? MISSING_VALUE_LABEL}
        </span>
        <span className="text-sm text-black">${row.unitPrice.toFixed(2)} each</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Qty</span>
          <QuantityControl row={row} onIncrease={onIncrease} onDecrease={onDecrease} />
        </div>
        <span className="text-sm text-black" style={{ fontWeight: 540 }}>
          ${row.lineTotal.toFixed(2)} total
        </span>
      </div>
      <RowStatus row={row} sharedTier={sharedTier} />
      <button
        type="button"
        className="mt-2 text-xs text-red-600 hover:text-red-800"
        aria-label={`Remove ${row.colour ?? ''} / ${row.size ?? ''}`}
        onClick={() => onRemove(row.cartItemKey)}
      >
        Delete
      </button>
    </div>
  )
}
