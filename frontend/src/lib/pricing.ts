import type { ProductPriceTier, ProductPrintPriceTier } from '@/types'

/** Formats a value as a plain NZD amount, e.g. 25 → "$25.00". Matches the `$X.XX` style used across the UI. */
export function formatMoneyNZD(value: number): string {
  return `$${value.toFixed(2)}`
}

/**
 * Customer-facing label for a tier break.
 *   1  → "1 pc"
 *   2  → "2+"
 *   10 → "10+"
 * The lowest break (quantity 1) reads as a single piece; every higher break is open-ended.
 */
export function formatTierLabel(minQuantity: number): string {
  return minQuantity <= 1 ? '1 pc' : `${minQuantity}+`
}

/**
 * @deprecated Legacy all-in tiers (Jira 9102), inert in pricing since 9203. Do not use in new UI.
 * Product-level (non-override) tiers, sorted ascending by MinQuantity.
 */
export function productLevelTiers(tiers: ProductPriceTier[]): ProductPriceTier[] {
  return tiers
    .filter((t) => t.productVariantId === null)
    .sort((a, b) => a.minQuantity - b.minQuantity)
}

// ─── Print-only tiers (Jira 9203/9206) ──────────────────────────────────────────

/** A print-size's ladder of group-default print prices, sorted ascending by MinQuantity. */
export interface PrintPriceLadder {
  printSizeId: string
  rows: ProductPrintPriceTier[]
}

/**
 * Group the active group-default (size = null) print tiers by PrintSize into per-size ladders.
 * Size-override rows (size != null) are excluded — they are surfaced via {@link hasSizeOverridePrintTiers}.
 */
export function groupDefaultPrintLadders(tiers: ProductPrintPriceTier[]): PrintPriceLadder[] {
  const bySize = new Map<string, ProductPrintPriceTier[]>()
  for (const t of tiers) {
    if (!t.isActive || t.size !== null) continue
    if (!bySize.has(t.printSizeId)) bySize.set(t.printSizeId, [])
    bySize.get(t.printSizeId)!.push(t)
  }
  return [...bySize.entries()].map(([printSizeId, rows]) => ({
    printSizeId,
    rows: rows.sort((a, b) => a.minQuantity - b.minQuantity),
  }))
}

/** True when any active size-override (size != null) print tier exists. */
export function hasSizeOverridePrintTiers(tiers: ProductPrintPriceTier[]): boolean {
  return tiers.some((t) => t.isActive && t.size !== null)
}

/** Cheapest achievable active print-tier price across all sizes/scopes, or null when none. */
export function cheapestPrintTierPrice(tiers: ProductPrintPriceTier[]): number | null {
  const active = tiers.filter((t) => t.isActive)
  if (active.length === 0) return null
  return Math.min(...active.map((t) => t.unitPrintPrice))
}
