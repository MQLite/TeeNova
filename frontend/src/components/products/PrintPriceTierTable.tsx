'use client'

import { formatMoneyNZD, formatTierLabel, groupDefaultPrintLadders, hasSizeOverridePrintTiers } from '@/lib/pricing'
import type { ProductPrintPriceTier } from '@/types'

interface Props {
  /** The product's group print tiers (already active-only from the public DTO). */
  tiers: ProductPrintPriceTier[]
  /** printSizeId → display name. */
  printSizeNames: Record<string, string>
  /** The applied break from the live quote, to highlight the active row (optional). */
  appliedMinQuantity?: number | null
}

/**
 * Customer-facing print-price ladders by PrintSize (Jira 9206). Replaces the old all-in
 * TierPricingStrip. Garment price is separate and fixed; this shows print price only.
 * Renders nothing when there are no group-default print ladders.
 */
export function PrintPriceTierTable({ tiers, printSizeNames, appliedMinQuantity }: Props) {
  const ladders = groupDefaultPrintLadders(tiers)
  if (ladders.length === 0) return null

  return (
    <div className="space-y-3">
      {ladders.map((ladder) => (
        <div key={ladder.printSizeId} className="overflow-hidden rounded-2xl border border-black/[0.08]">
          <div className="border-b border-black/[0.06] bg-black/[0.02] px-4 py-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
              {printSizeNames[ladder.printSizeId] ?? 'Print size'} · print price
            </span>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-black/[0.06]">
              {ladder.rows.map((row) => {
                const active = appliedMinQuantity != null && row.minQuantity === appliedMinQuantity
                return (
                  <tr key={row.id} className={active ? 'bg-black/[0.04]' : undefined}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
                        {formatTierLabel(row.minQuantity)}
                      </span>
                      {active && (
                        <span className="ml-2 rounded-full bg-black px-2 py-0.5 text-[9px] uppercase tracking-[0.54px] text-white">
                          Applied
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-black" style={{ fontWeight: 480 }}>
                      {formatMoneyNZD(row.unitPrintPrice)}
                      <span className="text-black/45"> print</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      <p className="text-xs text-black/45" style={{ letterSpacing: '-0.14px' }}>
        Print price only — added to the fixed garment price. Quantity breaks combine across products in
        the same print pricing group.
      </p>

      {hasSizeOverridePrintTiers(tiers) && (
        <p className="text-xs text-black/45" style={{ letterSpacing: '-0.14px' }}>
          Some garment sizes have their own print prices. The exact price is shown after you select a size.
        </p>
      )}
    </div>
  )
}
