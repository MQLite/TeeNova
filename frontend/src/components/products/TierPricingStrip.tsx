'use client'

import { formatMoneyNZD, formatTierLabel, productLevelTiers } from '@/lib/pricing'
import type { ProductPriceTier } from '@/types'

interface Props {
  tiers: ProductPriceTier[]
  /** Min quantity of the tier currently applied by the live quote, to highlight the active row. */
  appliedMinQuantity?: number | null
}

/**
 * Customer-facing quantity-break table for the standard one-side printed product. Renders
 * product-level tiers only; if any variant-override tiers exist a small honest note is shown.
 * Renders nothing when there are no product-level tiers.
 */
export function TierPricingStrip({ tiers, appliedMinQuantity }: Props) {
  const productTiers = productLevelTiers(tiers)
  if (productTiers.length === 0) return null

  const hasVariantOverrides = tiers.some((t) => t.productVariantId !== null)

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-line">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-black/[0.06]">
            {productTiers.map((tier) => {
              const active = appliedMinQuantity != null && tier.minQuantity === appliedMinQuantity
              return (
                <tr
                  key={tier.id}
                  className={active ? 'bg-surface-sunken' : undefined}
                >
                  <td className="px-4 py-2.5">
                    <span
                      className="eyebrow text-ink-muted"
                    >
                      {formatTierLabel(tier.minQuantity)}
                    </span>
                    {active && (
                      <span className="ml-2 rounded-full bg-surface-inverse px-2 py-0.5 text-[9px] uppercase tracking-[0.54px] text-white">
                        Applied
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink" style={{ fontWeight: 500 }}>
                    {formatMoneyNZD(tier.unitPrice)}
                    <span className="text-ink-muted"> ea</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {hasVariantOverrides && (
        <p className="mt-2 text-xs text-ink-muted">
          Some sizes or colours have their own pricing — the exact price is shown as you select quantities.
        </p>
      )}
    </div>
  )
}
