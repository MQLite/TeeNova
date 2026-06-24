import type { ProductPrintConfigOption } from '@/types'

/**
 * Result of resolving a product's scoped allowed print options for a set of selected garment sizes
 * (Jira 9206). Mirrors the backend resolver (9204):
 *  - 'global' — no scoped rows apply → use the global PrintAreaSizeOption matrix (unchanged behaviour)
 *  - 'scoped' — scoped rows apply → only the listed (printAreaId, printSizeId) pairs are allowed
 *  - 'empty'  — multiple sizes were selected but they share no common scoped option → block prints
 */
export type ScopeResolution =
  | { mode: 'global' }
  | { mode: 'scoped'; allowed: Map<string, Set<string>> } // printAreaId → set of printSizeId
  | { mode: 'empty' }

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
 * Resolve the allowed print options for the given active scoped rows + selected garment sizes.
 *
 *  - No active scoped rows at all → 'global'.
 *  - No size selected yet → product-default rows if any (else 'global').
 *  - One size → that size's override rows, else product-default, else 'global' (size unscoped).
 *  - Multiple sizes → intersection of each size's allowed pairs; sizes with no scoped rows impose no
 *    extra narrowing. If no selected size has scoped rows → 'global'. Empty intersection → 'empty'.
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

  // Intersection across all constrained sizes.
  let intersection = new Set(constrained[0])
  for (let i = 1; i < constrained.length; i++) {
    intersection = new Set([...intersection].filter((p) => constrained[i].has(p)))
  }

  if (intersection.size === 0) return { mode: 'empty' }
  return { mode: 'scoped', allowed: toAreaMap(intersection) }
}
