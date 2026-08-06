'use client'

import { formatTierLabel } from '@/lib/pricing'
import type { PriceCalculationResponse } from '@/types'

interface SelectedVariantLine {
  variantId: string
  color: string
  size: string
  quantity: number
}

interface PricingBreakdownPanelProps {
  selectedLines: SelectedVariantLine[]
  pricingByVariantId: Record<string, PriceCalculationResponse | undefined>
  pricingErrorsByVariantId: Record<string, string | undefined>
  grandTotal: number
  currency: string
  isComplete: boolean
  loading: boolean
  error: string | null
  validationMessage?: string | null
}

/**
 * Print-only pricing preview (Jira 9206): fixed garment price + summed resolved print prices.
 * No "included" print, no all-in tier. PrintArea is placement only and is not shown as a price.
 */
export function PricingBreakdownPanel({
  selectedLines,
  pricingByVariantId,
  pricingErrorsByVariantId,
  grandTotal,
  currency,
  isComplete,
  loading,
  error,
  validationMessage,
}: PricingBreakdownPanelProps) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink" style={{ fontWeight: 500 }}>
            Pricing Preview
          </p>
          <p className="mt-1 eyebrow text-ink-muted">
            Fixed garment price + print price per selected line
          </p>
        </div>
        {loading && <div className="h-5 w-5 animate-spin rounded-full border-2 border-line-control border-t-black" />}
      </div>

      {selectedLines.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-line-strong py-6 text-center text-sm text-ink-muted">
          Enter quantities to see pricing.
        </p>
      ) : validationMessage ? (
        <p className="mt-4 rounded-lg border border-warning-border bg-warning-surface px-4 py-3 text-sm text-amber-800">
          {validationMessage}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {selectedLines.map((line) => {
            const pricing = pricingByVariantId[line.variantId]
            const lineError = pricingErrorsByVariantId[line.variantId]

            return (
              <div key={line.variantId} className="rounded-2xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-ink" style={{ fontWeight: 500 }}>
                      {line.color} / {line.size}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Qty {line.quantity}
                    </p>
                  </div>
                  {pricing ? (
                    <div className="text-right">
                      <p className="text-sm text-ink tabular-nums" style={{ fontWeight: 500 }}>
                        {pricing.currency} ${pricing.lineTotal.toFixed(2)}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted tabular-nums">
                        {pricing.currency} ${pricing.unitPrice.toFixed(2)} each
                      </p>
                    </div>
                  ) : lineError ? (
                    <span className="text-xs text-danger">Pricing failed</span>
                  ) : (
                    <span className="text-xs text-ink-muted">Waiting for pricing</span>
                  )}
                </div>

                {pricing && (
                  <div className="mt-3 space-y-1.5 rounded-xl bg-surface-sunken px-3 py-2">
                    {/* Garment (fixed) */}
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-ink-secondary">Garment</span>
                      <span className="tabular-nums text-ink-muted">${pricing.garmentUnitPrice.toFixed(2)}</span>
                    </div>

                    {/* Prints (resolved print prices) */}
                    {pricing.printAddOns.length > 0 && (
                      <>
                        <p className="eyebrow text-ink-muted">Prints</p>
                        {pricing.printAddOns.map((addOn) => (
                          <div
                            key={`${addOn.printAreaId}:${addOn.printSizeId}`}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="text-ink-secondary">
                              {addOn.printAreaName} · {addOn.printSizeName}
                              {addOn.appliedTierMinQuantity != null && (
                                <span className="ml-1 text-ink-muted">({formatTierLabel(addOn.appliedTierMinQuantity)})</span>
                              )}
                            </span>
                            <span className="tabular-nums text-ink-muted">+${addOn.resolvedUnitPrintPrice.toFixed(2)}</span>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Unit total */}
                    <div className="flex items-center justify-between gap-3 border-t border-line pt-1.5 text-xs">
                      <span className="text-ink-secondary" style={{ fontWeight: 500 }}>Unit total</span>
                      <span className="tabular-nums text-ink" style={{ fontWeight: 500 }}>${pricing.unitPrice.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {lineError && (
                  <p className="mt-3 text-sm text-danger">
                    {lineError}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-ink" style={{ fontWeight: 600 }}>
            Grand Total
          </span>
          <span className="text-xl text-ink tabular-nums" style={{ fontWeight: 600 }}>
            {currency} ${grandTotal.toFixed(2)}
          </span>
        </div>
        {!isComplete && selectedLines.length > 0 && !validationMessage && (
          <p className="mt-2 text-sm text-ink-muted">
            Complete pricing for every selected line to unlock the next step.
          </p>
        )}
      </div>
    </div>
  )
}
