'use client'

import { useState } from 'react'
import { formatMoneyNZD, formatTierLabel, groupDefaultPrintLadders, hasSizeOverridePrintTiers } from '@/lib/pricing'
import type { ProductPrintPriceTier } from '@/types'

interface Props {
  /** The product's group print tiers (already active-only from the public DTO). */
  tiers: ProductPrintPriceTier[]
  /** printSizeId → display name. */
  printSizeNames: Record<string, string>
  /** printSizeId → print-config sort order, used to order the rows (lowest first). */
  printSizeSortOrder?: Record<string, number>
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
  printSizeSortOrder,
  appliedMinQuantity,
  defaultPrintSizeId,
  collapsible = false,
  initiallyExpanded = false,
}: Props) {
  // Order the rows by the print-config sort order (lowest first) so the matrix matches admin config.
  const grouped = groupDefaultPrintLadders(tiers)
  const ladders = printSizeSortOrder
    ? [...grouped].sort(
        (a, b) =>
          (printSizeSortOrder[a.printSizeId] ?? Number.MAX_SAFE_INTEGER) -
          (printSizeSortOrder[b.printSizeId] ?? Number.MAX_SAFE_INTEGER),
      )
    : grouped
  const [expanded, setExpanded] = useState(initiallyExpanded)
  if (ladders.length === 0) return null

  // "Show less" mode keeps at most this many print-size rows visible.
  const COLLAPSED_MAX_ROWS = 5
  // Compact mode only adds value when there are more rows than the collapsed cap to hide.
  const compact = collapsible && ladders.length > COLLAPSED_MAX_ROWS
  const defaultLadder =
    (defaultPrintSizeId ? ladders.find((l) => l.printSizeId === defaultPrintSizeId) : undefined) ?? ladders[0]
  const otherLadders = ladders.filter((l) => l.printSizeId !== defaultLadder.printSizeId)

  const orderedLadders = compact ? [defaultLadder, ...otherLadders] : ladders
  const shownLadders = compact && !expanded ? orderedLadders.slice(0, COLLAPSED_MAX_ROWS) : orderedLadders

  // Transposed matrix (Jira): quantity breaks run across the columns, print sizes down the rows.
  // Breaks are the union across the shown ladders, sorted ascending.
  const breaks = Array.from(
    new Set(shownLadders.flatMap((ladder) => ladder.rows.map((row) => row.minQuantity))),
  ).sort((a, b) => a - b)

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-sunken">
              <th className="px-4 py-2 text-left font-mono text-[11px] font-normal uppercase tracking-[0.54px] text-ink-muted">
                Print size
              </th>
              {breaks.map((minQuantity) => {
                const active = appliedMinQuantity != null && minQuantity === appliedMinQuantity
                return (
                  <th
                    key={minQuantity}
                    className={`px-4 py-2 text-right font-mono text-[11px] font-normal uppercase tracking-[0.54px] ${
                      active ? 'text-ink' : 'text-ink-muted'
                    }`}
                  >
                    {formatTierLabel(minQuantity)}
                    {active && (
                      <span className="ml-1.5 rounded-full bg-surface-inverse px-1.5 py-0.5 text-[9px] uppercase tracking-[0.54px] text-white">
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
                  <th className="px-4 py-2.5 text-left font-mono text-[11px] font-normal uppercase tracking-[0.54px] text-ink-muted">
                    {printSizeNames[ladder.printSizeId] ?? 'Print size'}
                  </th>
                  {breaks.map((minQuantity) => {
                    const active = appliedMinQuantity != null && minQuantity === appliedMinQuantity
                    const price = priceByBreak.get(minQuantity)
                    return (
                      <td
                        key={minQuantity}
                        className={`px-4 py-2.5 text-right tabular-nums text-ink ${active ? 'bg-surface-sunken' : ''}`}
                        style={{ fontWeight: 500 }}
                      >
                        {price != null ? formatMoneyNZD(price) : <span className="text-ink-muted">—</span>}
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
          className="eyebrow text-ink-muted transition-colors hover:text-ink"
        >
          {expanded ? 'Show fewer print sizes' : `Show all print sizes (${ladders.length})`}
        </button>
      )}

      <p className="text-xs text-ink-muted">
        Print price only — added to the fixed garment price. Quantity breaks combine across products in
        the same print pricing group.
      </p>

      {hasSizeOverridePrintTiers(tiers) && (
        <p className="text-xs text-ink-muted">
          Some garment sizes have their own print prices. The exact price is shown after you select a size.
        </p>
      )}
    </div>
  )
}
