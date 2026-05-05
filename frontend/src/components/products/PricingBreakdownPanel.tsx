'use client'

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
          <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
            Pricing Preview
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
            Backend pricing per selected variant line
          </p>
        </div>
        {loading && <div className="h-5 w-5 animate-spin rounded-full border-2 border-black/10 border-t-black" />}
      </div>

      {selectedLines.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-black/[0.12] py-6 text-center text-sm text-black/55">
          Enter quantities to see pricing.
        </p>
      ) : validationMessage ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {validationMessage}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {selectedLines.map((line) => {
            const pricing = pricingByVariantId[line.variantId]
            const lineError = pricingErrorsByVariantId[line.variantId]

            return (
              <div key={line.variantId} className="rounded-2xl border border-black/[0.08] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                      {line.color} / {line.size}
                    </p>
                    <p className="mt-1 text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>
                      Qty {line.quantity}
                    </p>
                  </div>
                  {pricing ? (
                    <div className="text-right">
                      <p className="text-sm text-black tabular-nums" style={{ fontWeight: 480 }}>
                        {pricing.currency} ${pricing.lineTotal.toFixed(2)}
                      </p>
                      <p className="mt-1 text-xs text-black/50 tabular-nums">
                        {pricing.currency} ${pricing.unitPrice.toFixed(2)} each
                      </p>
                    </div>
                  ) : lineError ? (
                    <span className="text-xs text-red-600">Pricing failed</span>
                  ) : (
                    <span className="text-xs text-black/45">Waiting for pricing</span>
                  )}
                </div>

                {pricing && pricing.printAddOns.length > 0 && (
                  <div className="mt-3 space-y-1.5 rounded-xl bg-black/[0.02] px-3 py-2">
                    {pricing.printAddOns.map((addOn) => (
                      <div key={`${addOn.printAreaId}:${addOn.printSizeId}`} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-black/60" style={{ letterSpacing: '-0.14px' }}>
                          {addOn.printAreaName} · {addOn.printSizeName}
                        </span>
                        <span className="tabular-nums text-black/55">+${addOn.linePrice.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {lineError && (
                  <p className="mt-3 text-sm text-red-600" style={{ letterSpacing: '-0.14px' }}>
                    {lineError}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 border-t border-black/[0.08] pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
            Grand Total
          </span>
          <span className="text-xl text-black tabular-nums" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
            {currency} ${grandTotal.toFixed(2)}
          </span>
        </div>
        {!isComplete && selectedLines.length > 0 && !validationMessage && (
          <p className="mt-2 text-sm text-black/50" style={{ letterSpacing: '-0.14px' }}>
            Complete pricing for every selected line to unlock the next step.
          </p>
        )}
      </div>
    </div>
  )
}
