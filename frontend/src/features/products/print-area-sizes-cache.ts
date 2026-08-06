import type { PrintAreaSizeOption } from '@/types'

/**
 * Client-side cache for `GET /api/print-config/areas/{areaId}/sizes` (Jira 10304).
 *
 * These options are **global** configuration keyed by print area alone — they are not product- or
 * garment-size-specific, so one module-level map is correct across every product page in the session.
 * (Product/garment-size narrowing is a separate, purely client-side concern: it is applied on top of
 * this global list from `product.printConfigOptions`, see `lib/print-options.ts`. Nothing scoped is
 * ever stored here.)
 *
 * Two problems are solved:
 *   1. Re-selecting an area, or opening a second product, refetched the same global list every time.
 *   2. Two selections of the same area in flight at once issued two identical requests.
 *
 * A short TTL bounds staleness in a long-lived SPA session so an Admin print-config change is picked
 * up without a reload. A rejected load is never cached, so deselect/reselect still retries.
 */

/** Milliseconds a cached per-area option list may be reused. Matches the server print-config window. */
export const PRINT_AREA_SIZES_TTL_MS = 5 * 60_000

interface CacheEntry {
  options: PrintAreaSizeOption[]
  storedAt: number
}

const completed = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<PrintAreaSizeOption[]>>()

/** Fresh cached options for an area, or undefined when absent or expired. */
export function getCachedPrintAreaSizes(
  areaId: string,
  now: number = Date.now(),
): PrintAreaSizeOption[] | undefined {
  const entry = completed.get(areaId)
  if (!entry) return undefined
  if (now - entry.storedAt > PRINT_AREA_SIZES_TTL_MS) {
    completed.delete(areaId)
    return undefined
  }
  return entry.options
}

/**
 * Loads an area's global size options, serving a fresh cache entry when available and otherwise
 * sharing a single in-flight request between concurrent callers.
 */
export function loadPrintAreaSizes(
  areaId: string,
  fetcher: (areaId: string) => Promise<PrintAreaSizeOption[]>,
  now: number = Date.now(),
): Promise<PrintAreaSizeOption[]> {
  const cached = getCachedPrintAreaSizes(areaId, now)
  if (cached) return Promise.resolve(cached)

  const pending = inFlight.get(areaId)
  if (pending) return pending

  const request = fetcher(areaId)
    .then((options) => {
      completed.set(areaId, { options, storedAt: Date.now() })
      return options
    })
    .finally(() => {
      // Failures are deliberately not cached: the customer can deselect/reselect to retry.
      inFlight.delete(areaId)
    })

  inFlight.set(areaId, request)
  return request
}

/** Test seam — clears both the completed cache and the in-flight registry. */
export function resetPrintAreaSizesCache(): void {
  completed.clear()
  inFlight.clear()
}
