import type { ProductPriceTier } from '@/types'

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

/** Product-level (non-override) tiers, sorted ascending by MinQuantity. */
export function productLevelTiers(tiers: ProductPriceTier[]): ProductPriceTier[] {
  return tiers
    .filter((t) => t.productVariantId === null)
    .sort((a, b) => a.minQuantity - b.minQuantity)
}
