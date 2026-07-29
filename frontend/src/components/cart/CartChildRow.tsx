'use client'

import { BannerDetailSummary } from '@/components/products/BannerDetailSummary'
import { MISSING_VALUE_LABEL, type CartProductRow } from '@/features/cart/cart-grouping'
import { tierHint, type CartLinePricing } from '@/features/cart/useCartPricing'

interface Props {
  row: CartProductRow<CartLinePricing>
  /** All three callbacks receive the row's own cartItemKey — the only safe mutation identity. */
  onIncrease: (cartItemKey: string) => void
  onDecrease: (cartItemKey: string) => void
  onRemove: (cartItemKey: string) => void
}

/**
 * One source cart line inside a product group (Jira 10102). Strictly one-to-one with a `cartItemKey`:
 * this component never merges lines and never derives a mutation key from colour, size, index or
 * product id — it only ever passes back `row.cartItemKey`.
 *
 * The layout is kind-aware: garments show Colour / Size / Qty plus their print placements; Badge and
 * FixedSize Banner omit the apparel fields entirely rather than rendering misleading blanks.
 */
export function CartChildRow({ row, onIncrease, onDecrease, onRemove }: Props) {
  const { item, pricing, pricingError } = row
  const isBanner = item.kind === 'Banner'
  const isBadge = item.kind === 'Badge'
  const isSimpleUnit = isBadge || isBanner
  const hint = tierHint(pricing, row.printTierQuantity)
  const rowLabel = describeRow(row)

  return (
    <div
      data-testid={`cart-row-${row.cartItemKey}`}
      className="px-4 py-4 sm:px-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Colour · Size · Qty — the prominent identity of a garment row. */}
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            {!isSimpleUnit && (
              <>
                <Field label="Colour" value={row.colour ?? MISSING_VALUE_LABEL} />
                <Field label="Size" value={row.size ?? MISSING_VALUE_LABEL} />
              </>
            )}
            {isBadge && <Field label="Type" value="Badge" />}
            {isBanner && <Field label="Type" value="Banner · Fixed size" />}
            <Field label="Qty" value={String(row.quantity)} />
          </div>

          {/* Production detail — what makes this row different from another row with the same
              colour and size. Never hidden behind colour/size alone. */}
          {!isSimpleUnit && (
            <div className="mt-2">
              {(item.prints ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {(item.prints ?? []).map((print) => (
                    <span
                      key={`${print.printAreaId}:${print.printSizeId}`}
                      className="inline-flex flex-col rounded-lg border border-black/[0.08] px-2 py-1 text-[10px] text-black/55"
                    >
                      <span>{print.printAreaName} - {print.printSizeName}</span>
                      {print.uploadedAssetUrl && <span className="text-green-600">Design uploaded</span>}
                      {print.designNote && (
                        <span className="normal-case tracking-normal text-black/45">{print.designNote}</span>
                      )}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">
                  No print placements
                </p>
              )}
            </div>
          )}

          {isBanner && item.bannerDetail && <BannerDetailSummary detail={item.bannerDetail} className="mt-2" />}

          {isSimpleUnit && (item.uploadedAssetUrl || item.designNote) && (
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="inline-flex flex-col rounded-lg border border-black/[0.08] px-2 py-1 text-[10px] text-black/55">
                {item.uploadedAssetUrl && <span className="text-green-600">Design uploaded</span>}
                {item.designNote && (
                  <span className="normal-case tracking-normal text-black/45">{item.designNote}</span>
                )}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onRemove(row.cartItemKey)}
          aria-label={`Remove ${rowLabel}`}
          title="Remove"
          className="flex-shrink-0 rounded-full p-1.5 text-black/25 transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Badge / FixedSize Banner price breakdown: a single backend unit price (Jira 9504/9517). */}
      {isSimpleUnit && pricing && !pricingError && (
        <div className="mt-3 space-y-1 rounded-lg bg-black/[0.02] px-3 py-2 text-xs text-black/60">
          <div className="flex items-center justify-between" style={{ letterSpacing: '-0.14px' }}>
            <span>Unit price</span>
            <span className="text-black/75">${pricing.unitPrice.toFixed(2)}</span>
          </div>
          {isBadge && pricing.appliedTierMinQuantity != null && (
            <div className="flex items-center justify-between" style={{ letterSpacing: '-0.14px' }}>
              <span>Quantity tier</span>
              <span className="text-black/75">{pricing.appliedTierMinQuantity}+</span>
            </div>
          )}
        </div>
      )}

      {/* Print-only price breakdown: fixed garment + summed print prices (Jira 9207) */}
      {!isSimpleUnit && pricing && !pricingError && (
        <div className="mt-3 space-y-1 rounded-lg bg-black/[0.02] px-3 py-2 text-xs text-black/60">
          <div className="flex items-center justify-between" style={{ letterSpacing: '-0.14px' }}>
            <span>Garment</span>
            <span className="text-black/75">${pricing.garmentUnitPrice.toFixed(2)}</span>
          </div>
          {pricing.prints.map((print) => (
            <div
              key={`${print.printAreaId}:${print.printSizeId}`}
              className="flex items-center justify-between"
              style={{ letterSpacing: '-0.14px' }}
            >
              <span>
                {print.printAreaName} - {print.printSizeName} <span className="text-black/40">print</span>
              </span>
              <span className="text-black/75">${print.resolvedUnitPrintPrice.toFixed(2)}</span>
            </div>
          ))}
          <div
            className="flex items-center justify-between border-t border-black/[0.06] pt-1"
            style={{ letterSpacing: '-0.14px' }}
          >
            <span className="text-black/75" style={{ fontWeight: 480 }}>Unit total</span>
            <span className="text-black" style={{ fontWeight: 540 }}>${row.unitPrice.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Print volume tier note (garment only) */}
      {!isSimpleUnit && pricing && !pricingError && pricing.pricingMode === 'Tiered' && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {pricing.appliedTierMinQuantity != null && (
            <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.54px] text-black/55">
              Print volume price: {pricing.appliedTierMinQuantity <= 1 ? '1 pc' : `${pricing.appliedTierMinQuantity}+`}
            </span>
          )}
          <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.54px] text-black/55">
            Group quantity: {row.printTierQuantity}
          </span>
          {hint && (
            <span className="text-[11px] text-black/45" style={{ letterSpacing: '-0.14px' }}>
              {hint}
            </span>
          )}
        </div>
      )}

      {pricingError && (
        <div
          className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          style={{ letterSpacing: '-0.14px' }}
        >
          <p>{pricingError}</p>
          <p className="mt-1 text-red-600">
            This print option may no longer be available for the selected size. Please remove this item and add it again.
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-0 rounded-full border border-black/[0.10]">
          <button
            type="button"
            aria-label={`Decrease quantity of ${rowLabel}`}
            className="px-3 py-1.5 text-base text-black/50 transition-colors hover:text-black"
            onClick={() => onDecrease(row.cartItemKey)}
          >-</button>
          <span className="min-w-[2rem] text-center text-sm text-black" style={{ fontWeight: 480 }}>
            {row.quantity}
          </span>
          <button
            type="button"
            aria-label={`Increase quantity of ${rowLabel}`}
            className="px-3 py-1.5 text-base text-black/50 transition-colors hover:text-black"
            onClick={() => onIncrease(row.cartItemKey)}
          >+</button>
        </div>
        <div className="text-right">
          <p className="text-base text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
            ${row.lineTotal.toFixed(2)}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
            ${row.unitPrice.toFixed(2)} each
          </p>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">{label}</span>
      <span className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
        {value}
      </span>
    </span>
  )
}

/** Human-readable row description for the action labels — never used as a mutation identity. */
function describeRow(row: CartProductRow<CartLinePricing>): string {
  const variant = [row.colour, row.size].filter((part): part is string => Boolean(part)).join(' / ')
  return [variant, row.detailLabel].filter((part): part is string => Boolean(part)).join(' · ')
    || row.item.productName
    || 'this item'
}
