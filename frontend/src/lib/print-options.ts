import type { ProductPrintConfigOption } from '@/types'

/**
 * Result of resolving a product's scoped allowed print options for a set of selected garment sizes
 * (Jira 9206). Mirrors the backend resolver (9204):
 *  - 'global' — no scoped rows apply → use the global PrintAreaSizeOption matrix (unchanged behaviour)
 *  - 'scoped' — scoped rows apply → the listed (printAreaId, printSizeId) pairs are offered, taken as
 *               the UNION across the selected garment sizes. A print size suitable for only some of the
 *               selected sizes stays selectable; the smaller garments get a smaller print (see
 *               {@link unsupportedSizesForPair}). There is no longer an "all sizes must share it" block.
 */
export type ScopeResolution =
  | { mode: 'global' }
  | { mode: 'scoped'; allowed: Map<string, Set<string>> } // printAreaId → set of printSizeId

/** Pairs allowed for one garment size, or null when that size has no scoped rows (= global, no narrowing). */
function allowedPairsForSize(
  activeOptions: ProductPrintConfigOption[],
  size: string,
): Set<string> | null {
  const override = activeOptions.filter((o) => o.size === size)
  const rows = override.length > 0 ? override : activeOptions.filter((o) => o.size === null)
  if (rows.length === 0) return null
  return new Set(rows.map((o) => `${o.printAreaId}:${o.printSizeId}`))
}

/** Pair set → Map<areaId, Set<sizeId>>. */
function toAreaMap(pairs: Set<string>): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const pair of pairs) {
    const [areaId, sizeId] = pair.split(':')
    if (!map.has(areaId)) map.set(areaId, new Set())
    map.get(areaId)!.add(sizeId)
  }
  return map
}

/**
 * The set of print-size ids this product can ever print, derived from its active scoped config
 * options (product-default rows + every garment-size override). Display-only widgets (hero card,
 * print-price matrix) use this to drop print sizes the product can never select — e.g. a kids tee
 * whose pricing group still lists A3 (Jira 9204). Returns null when there are no active scoped rows
 * (global mode → no constraint, so callers should not narrow).
 */
export function printableSizeIdsFromOptions(
  activeOptions: ProductPrintConfigOption[],
): Set<string> | null {
  if (activeOptions.length === 0) return null
  return new Set(activeOptions.map((o) => o.printSizeId))
}

/**
 * Resolve the allowed print options for the given active scoped rows + selected garment sizes.
 *
 *  - No active scoped rows at all → 'global'.
 *  - No size selected yet → product-default rows if any (else 'global').
 *  - One size → that size's override rows, else product-default, else 'global' (size unscoped).
 *  - Multiple sizes → UNION of each size's allowed pairs; sizes with no scoped rows impose no
 *    constraint. If no selected size has scoped rows → 'global'. A size suitable for only some of the
 *    selected garment sizes stays offered (printed smaller on the rest, see {@link unsupportedSizesForPair}).
 */
export function resolveAllowedPrintOptions(
  activeOptions: ProductPrintConfigOption[],
  selectedSizes: string[],
): ScopeResolution {
  if (activeOptions.length === 0) return { mode: 'global' }

  if (selectedSizes.length === 0) {
    const defaults = activeOptions.filter((o) => o.size === null)
    if (defaults.length === 0) return { mode: 'global' }
    return { mode: 'scoped', allowed: toAreaMap(new Set(defaults.map((o) => `${o.printAreaId}:${o.printSizeId}`))) }
  }

  // Each selected size contributes its allowed pair-set, or null (= no scoped constraint).
  const perSize = selectedSizes.map((s) => allowedPairsForSize(activeOptions, s))
  const constrained = perSize.filter((s): s is Set<string> => s !== null)

  if (constrained.length === 0) return { mode: 'global' }

  // Union across all constrained sizes: offer a pair if ANY selected size supports it.
  const union = new Set<string>()
  for (const set of constrained) for (const pair of set) union.add(pair)

  return { mode: 'scoped', allowed: toAreaMap(union) }
}

/**
 * The selected garment sizes that do NOT natively support the (areaId, sizeId) pair — i.e. sizes that
 * are scoped (have override/default rows) yet don't list this pair. These get a smaller print at the
 * chosen size's price. Sizes with no scoped rows impose no constraint and are never reported here.
 */
export function unsupportedSizesForPair(
  activeOptions: ProductPrintConfigOption[],
  selectedSizes: string[],
  areaId: string,
  sizeId: string,
): string[] {
  const pair = `${areaId}:${sizeId}`
  return selectedSizes.filter((size) => {
    const allowed = allowedPairsForSize(activeOptions, size)
    return allowed !== null && !allowed.has(pair)
  })
}
