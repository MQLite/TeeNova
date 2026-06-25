import type { PrintSize, ProductPriceTier, ProductPrintPriceTier } from '@/types'

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

/**
 * Resolve the print-size id whose name or code equals `target` (case-insensitive, trimmed),
 * e.g. "A3". Lets callers pick a default ladder without hard-coding an id. Returns null when absent.
 */
export function findPrintSizeIdByName(printSizes: PrintSize[], target: string): string | null {
  const needle = target.trim().toLowerCase()
  if (needle === '') return null
  const match = printSizes.find(
    (s) => s.name.trim().toLowerCase() === needle || s.code.trim().toLowerCase() === needle,
  )
  return match?.id ?? null
}

/**
 * Resolve the tier row that applies at `quantity` for a ladder: the highest `minQuantity <= quantity`
 * (mirrors the backend `PrintTierPriceResolver`). When every break is above `quantity` (e.g. a 12+
 * lowest break priced at 10), falls back to the lowest break so a reference price still resolves.
 * Returns null only for an empty ladder.
 */
export function resolveTierAtQuantity(
  ladder: PrintPriceLadder,
  quantity: number,
): ProductPrintPriceTier | null {
  if (ladder.rows.length === 0) return null
  // rows are sorted ascending by minQuantity in groupDefaultPrintLadders.
  let resolved: ProductPrintPriceTier | null = null
  for (const row of ladder.rows) {
    if (row.minQuantity <= quantity) resolved = row
  }
  return resolved ?? ladder.rows[0]
}

/** Display-only hero "from/reference" price message derived from existing pricing data (Jira 9303). */
export interface HeroPriceInfo {
  /** garment-from + resolved print price (preferred/fallback-print-size), printed-from, garment-from, or null. */
  price: number | null
  printSizeId?: string
  printSizeName?: string
  /** Quantity the price is referenced at (the reference quantity when a tier resolves at it). */
  quantity: number
  /** The resolved tier's actual MinQuantity — lets the UI decide whether a hard "minimum" claim is truthful. */
  tierMinQuantity?: number
  /** Supporting line, e.g. "for A3 printing + garment". */
  label: string
  mode: 'preferred' | 'fallback-print-size' | 'printed-from' | 'garment-only' | 'unavailable'
}

/**
 * Derive the hero "from/reference" price for the customer product page (Jira 9303). Display/marketing
 * only — never a new pricing rule and never fabricated. The live PricingBreakdownPanel stays the
 * authoritative selected-configuration price.
 *
 * Fallback order:
 *  A. preferred print size (e.g. A3) group-default ladder → garmentFrom + print price resolved at
 *     `referenceQuantity`.
 *  B. otherwise the first available group-default ladder, labelled with its real PrintSize name.
 *  C. otherwise `printedFromPrice` ("Printed from $X").
 *  D. otherwise `garmentFromPrice` ("From $X", garment only).
 *  E. no data → mode 'unavailable', price null.
 */
export function resolveHeroPrintPrice(params: {
  tiers: ProductPrintPriceTier[]
  printSizes: PrintSize[]
  printSizeNames: Record<string, string>
  garmentFromPrice: number | null
  printedFromPrice: number | null
  preferredPrintSizeName?: string
  referenceQuantity?: number
}): HeroPriceInfo {
  const {
    tiers,
    printSizes,
    printSizeNames,
    garmentFromPrice,
    printedFromPrice,
    preferredPrintSizeName = 'A3',
    referenceQuantity = 10,
  } = params

  const ladders = groupDefaultPrintLadders(tiers)

  const fromLadder = (
    ladder: PrintPriceLadder,
    mode: 'preferred' | 'fallback-print-size',
  ): HeroPriceInfo | null => {
    const tier = resolveTierAtQuantity(ladder, referenceQuantity)
    if (!tier || garmentFromPrice === null) return null
    const printSizeName = printSizeNames[ladder.printSizeId] ?? 'print'
    // When the lowest break is above the reference quantity, the price is referenced at that break.
    const quantity = tier.minQuantity <= referenceQuantity ? referenceQuantity : tier.minQuantity
    return {
      price: garmentFromPrice + tier.unitPrintPrice,
      printSizeId: ladder.printSizeId,
      printSizeName,
      quantity,
      tierMinQuantity: tier.minQuantity,
      label: `for ${printSizeName} printing + garment`,
      mode,
    }
  }

  // A. preferred print size (A3).
  const preferredId = findPrintSizeIdByName(printSizes, preferredPrintSizeName)
  if (preferredId) {
    const ladder = ladders.find((l) => l.printSizeId === preferredId)
    const info = ladder ? fromLadder(ladder, 'preferred') : null
    if (info) return info
  }

  // B. first available group-default ladder.
  if (ladders.length > 0) {
    const info = fromLadder(ladders[0], 'fallback-print-size')
    if (info) return info
  }

  // C. printed-from (tiers exist but no group-default ladder / no garment-from).
  if (printedFromPrice !== null) {
    return { price: printedFromPrice, quantity: 1, label: 'Garment + print', mode: 'printed-from' }
  }

  // D. garment only.
  if (garmentFromPrice !== null) {
    return {
      price: garmentFromPrice,
      quantity: 1,
      label: 'Garment price only. Print price updates when options are selected.',
      mode: 'garment-only',
    }
  }

  // E. nothing to show.
  return { price: null, quantity: 1, label: '', mode: 'unavailable' }
}
