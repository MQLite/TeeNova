'use client'

import { useState } from 'react'
import { formatMoneyNZD, formatTierLabel, groupDefaultPrintLadders, hasSizeOverridePrintTiers } from '@/lib/pricing'
import type { ProductPrintPriceTier } from '@/types'

interface Props {
  /** The product's group print tiers (already active-only from the public DTO). */
  tiers: ProductPrintPriceTier[]
  /** printSizeId → display name. */
  printSizeNames: Record<string, string>
  /** The applied break from the live quote, to highlight the active row (optional). */
  appliedMinQuantity?: number | null
  /** Compact mode: which PrintSize ladder to show by default (falls back to the first ladder). */
  defaultPrintSizeId?: string
  /** Compact mode: collapse the non-default ladders behind a "Show all print sizes" toggle. */
  collapsible?: boolean
  /** Compact mode: start expanded (all ladders visible). Default false. */
  initiallyExpanded?: boolean
}

/**
 * Customer-facing print-price ladders by PrintSize (Jira 9206). Replaces the old all-in
 * TierPricingStrip. Garment price is separate and fixed; this shows print price only.
 * Renders nothing when there are no group-default print ladders.
 *
 * Without `collapsible`, every ladder renders (legacy behaviour). With `collapsible` and a
 * `defaultPrintSizeId` (Jira 9304), only the default ladder shows; the rest hide behind an
 * accessible "Show all print sizes" toggle.
 */
export function PrintPriceTierTable({
  tiers,
  printSizeNames,
  appliedMinQuantity,
  defaultPrintSizeId,
  collapsible = false,
  initiallyExpanded = false,
}: Props) {
  const ladders = groupDefaultPrintLadders(tiers)
  const [expanded, setExpanded] = useState(initiallyExpanded)
  if (ladders.length === 0) return null

  // Compact mode only adds value when there is more than one ladder to hide.
  const compact = collapsible && ladders.length > 1
  const defaultLadder =
    (defaultPrintSizeId ? ladders.find((l) => l.printSizeId === defaultPrintSizeId) : undefined) ?? ladders[0]
  const otherLadders = ladders.filter((l) => l.printSizeId !== defaultLadder.printSizeId)

  const orderedLadders = compact ? [defaultLadder, ...otherLadders] : ladders
  const shownLadders = compact && !expanded ? [defaultLadder] : orderedLadders

  // Transposed matrix (Jira): quantity breaks run across the columns, print sizes down the rows.
  // Breaks are the union across the shown ladders, sorted ascending.
  const breaks = Array.from(
    new Set(shownLadders.flatMap((ladder) => ladder.rows.map((row) => row.minQuantity))),
  ).sort((a, b) => a - b)

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-black/[0.08]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/[0.06] bg-black/[0.02]">
              <th className="px-4 py-2 text-left font-mono text-[11px] font-normal uppercase tracking-[0.54px] text-black/55">
                Print size
              </th>
              {breaks.map((minQuantity) => {
                const active = appliedMinQuantity != null && minQuantity === appliedMinQuantity
                return (
                  <th
                    key={minQuantity}
                    className={`px-4 py-2 text-right font-mono text-[11px] font-normal uppercase tracking-[0.54px] ${
                      active ? 'text-black' : 'text-black/55'
                    }`}
                  >
                    {formatTierLabel(minQuantity)}
                    {active && (
                      <span className="ml-1.5 rounded-full bg-black px-1.5 py-0.5 text-[9px] uppercase tracking-[0.54px] text-white">
                        Applied
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.06]">
            {shownLadders.map((ladder) => {
              const priceByBreak = new Map(ladder.rows.map((row) => [row.minQuantity, row.unitPrintPrice]))
              return (
                <tr key={ladder.printSizeId}>
                  <th className="px-4 py-2.5 text-left font-mono text-[11px] font-normal uppercase tracking-[0.54px] text-black/55">
                    {printSizeNames[ladder.printSizeId] ?? 'Print size'}
                  </th>
                  {breaks.map((minQuantity) => {
                    const active = appliedMinQuantity != null && minQuantity === appliedMinQuantity
                    const price = priceByBreak.get(minQuantity)
                    return (
                      <td
                        key={minQuantity}
                        className={`px-4 py-2.5 text-right tabular-nums text-black ${active ? 'bg-black/[0.04]' : ''}`}
                        style={{ fontWeight: 480 }}
                      >
                        {price != null ? formatMoneyNZD(price) : <span className="text-black/30">—</span>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {compact && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55 transition-colors hover:text-black"
        >
          {expanded ? 'Show fewer print sizes' : `Show all print sizes (${ladders.length})`}
        </button>
      )}

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
