'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { pricingApi } from '@/api/pricing'
import { catalogApi } from '@/api/catalog'
import { ApiError } from '@/lib/api-client'
import {
  deduplicatePricingRequests,
  executeBatchWithRetry,
  indexBatchResults,
} from '@/features/cart/cart-pricing-orchestrator'
import type { CartItem, PriceCalculationRequest, PriceCalculationResponse } from '@/types'

/** Resolved print price for one selected print placement on a cart line. */
export interface CartLinePrintPricing {
  printAreaId: string
  printAreaName: string
  printSizeId: string
  printSizeName: string
  /** The print price actually charged for this print (resolved group tier or PrintSize base fallback). */
  resolvedUnitPrintPrice: number
  appliedTierMinQuantity: number | null
  nextTierMinQuantity: number | null
  nextTierUnitPrintPrice: number | null
}

export interface CartLinePricing {
  /** Fixed garment unit price (base + variant adjustment); never tier-discounted (Jira 9203). */
  garmentUnitPrice: number
  /** Sum of resolved print prices across all selected prints (0 when none). */
  printUnitPrice: number
  /** garmentUnitPrice + printUnitPrice. */
  unitPrice: number
  lineTotal: number
  pricingMode: PriceCalculationResponse['pricingMode']
  /** Per-print resolved pricing for the cart-line breakdown. */
  prints: CartLinePrintPricing[]
  /** Applied print-tier break of the first tiered print (for the line tier note), or null. */
  appliedTierMinQuantity: number | null
  /** Next higher print-tier break (for "add N more" hints), or null at the top. */
  nextTierMinQuantity: number | null
  nextTierUnitPrintPrice: number | null
  currency: string
}

export interface CartPricingResult {
  /** Recalculated pricing per cartItemKey. Undefined while loading or if that line errored. */
  pricingByKey: Record<string, CartLinePricing | undefined>
  /** Per-line error messages keyed by cartItemKey (e.g. a now-invalid scoped print option). */
  errorsByKey: Record<string, string | undefined>
  /** Print-pricing-group key per cartItemKey (`g:{groupId}` or `p:{productId}`). */
  groupKeyByItemKey: Record<string, string>
  /** Total garment quantity per group key — the print-tier scope; shared by every line in the group. */
  groupTotals: Record<string, number>
  /** True while a recalculation request is in flight. */
  loading: boolean
  /** True once every line has fresh pricing and no line errored. */
  isComplete: boolean
  /** Recalculated subtotal. Sums fresh line totals; falls back to the stored price for any line
   *  not yet (re)priced so the figure is never blank, but callers should gate actions on isComplete. */
  subtotal: number
  /** Overall recalculation error (e.g. all lines failed / network). Null when at least partial data is fine. */
  error: string | null
  /** Cart-level transient/server classification. Invalid configurations remain in errorsByKey. */
  errorKind: 'rate-limit' | 'generic' | null
  /** True after automatic 429 retries are exhausted or a general request failed. */
  canRetry: boolean
  /** Starts a fresh, serialized pricing generation. */
  retry: () => void
}

const INVALID_CONFIGURATION_MESSAGE =
  'This print option may no longer be available for the selected size. Please remove this item and add it again.'
const RATE_LIMIT_MESSAGE = "We're refreshing prices for this cart. Please wait a moment."
const GENERIC_PRICING_MESSAGE = "We couldn't refresh prices right now. Please try again."

function toCartLinePricing(r: PriceCalculationResponse): CartLinePricing {
  return {
    garmentUnitPrice: r.garmentUnitPrice,
    printUnitPrice: r.printUnitPrice,
    unitPrice: r.unitPrice,
    lineTotal: r.lineTotal,
    pricingMode: r.pricingMode,
    prints: r.printAddOns.map((p) => ({
      printAreaId: p.printAreaId,
      printAreaName: p.printAreaName,
      printSizeId: p.printSizeId,
      printSizeName: p.printSizeName,
      resolvedUnitPrintPrice: p.resolvedUnitPrintPrice,
      appliedTierMinQuantity: p.appliedTierMinQuantity,
      nextTierMinQuantity: p.nextTierMinQuantity,
      nextTierUnitPrintPrice: p.nextTierUnitPrintPrice,
    })),
    appliedTierMinQuantity: r.appliedTierMinQuantity,
    nextTierMinQuantity: r.nextTierMinQuantity,
    nextTierUnitPrintPrice: r.nextTierUnitPrice,
    currency: r.currency,
  }
}

/**
 * Print-pricing-group key for a cart item (Jira 9207).
 * `g:{groupId}` when the product belongs to a group (quantities combine across products and
 * PrintSize values in that group); otherwise `p:{productId}` so ungrouped products stay isolated.
 * A still-unknown legacy group (undefined, pending backfill) falls back to the isolated key.
 */
function groupKeyFor(item: CartItem, resolvedGroups: Record<string, string | null>): string {
  const groupId =
    item.printPricingGroupId !== undefined ? item.printPricingGroupId : resolvedGroups[item.productId]
  return groupId ? `g:${groupId}` : `p:${item.productId}`
}

/**
 * Recalculates cart line pricing through the backend quote API under the print-only model (Jira 9203/9207):
 * fixed garment price + summed resolved print prices, with the print-tier quantity aggregated per
 * PrintPricingGroup across products and PrintSize values. Backend stays the source of truth for the
 * final order; this only refreshes the displayed prices.
 */
export function useCartPricing(items: CartItem[]): CartPricingResult {
  // Backfilled group ids for legacy cart items that predate the printPricingGroupId field.
  const [resolvedGroups, setResolvedGroups] = useState<Record<string, string | null>>({})

  const itemsSignature = useMemo(
    () =>
      JSON.stringify(
        items.map((i) => ({
          k: i.cartItemKey,
          p: i.productId,
          v: i.productVariantId,
          q: i.quantity,
          g: i.printPricingGroupId === undefined ? '?' : i.printPricingGroupId,
          prints: (i.prints ?? []).map((pr) => `${pr.printAreaId}:${pr.printSizeId}`).sort(),
        })),
      ),
    [items],
  )

  // Backfill group membership for legacy items (printPricingGroupId === undefined) by fetching product
  // metadata. Fresh items already carry the field, so no fetch happens for normal carts.
  useEffect(() => {
    const unknown = Array.from(
      new Set(
        items
          .filter((i) => i.printPricingGroupId === undefined && !(i.productId in resolvedGroups))
          .map((i) => i.productId),
      ),
    )
    if (unknown.length === 0) return

    let cancelled = false
    Promise.allSettled(unknown.map((id) => catalogApi.getProduct(id))).then((results) => {
      if (cancelled) return
      setResolvedGroups((prev) => {
        const next = { ...prev }
        results.forEach((res, idx) => {
          const id = unknown[idx]
          // On failure, isolate the product (safe fallback) rather than mis-aggregating it.
          next[id] = res.status === 'fulfilled' ? res.value.printPricingGroupId ?? null : null
        })
        return next
      })
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsSignature, resolvedGroups])

  // Group keys + per-group total garment quantity (each cart line counted once, regardless of how
  // many prints it has — Jira 9207).
  const { groupKeyByItemKey, groupTotals } = useMemo(() => {
    const byKey: Record<string, string> = {}
    const totals: Record<string, number> = {}
    for (const item of items) {
      const key = groupKeyFor(item, resolvedGroups)
      byKey[item.cartItemKey] = key
      totals[key] = (totals[key] ?? 0) + item.quantity
    }
    return { groupKeyByItemKey: byKey, groupTotals: totals }
  }, [items, resolvedGroups])

  const [pricingByKey, setPricingByKey] = useState<Record<string, CartLinePricing | undefined>>({})
  const [errorsByKey, setErrorsByKey] = useState<Record<string, string | undefined>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<'rate-limit' | 'generic' | null>(null)
  const [canRetry, setCanRetry] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const generationRef = useRef(0)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const successfulQuoteCache = useRef(new Map<string, CartLinePricing>())
  const retry = useCallback(() => setRetryToken((token) => token + 1), [])

  // Quote signature includes the resolved group tierQuantity so a quantity change anywhere in a group
  // re-quotes every line in that group.
  const quoteSignature = useMemo(
    () =>
      JSON.stringify(
        items.map((i) => ({
          k: i.cartItemKey,
          p: i.productId,
          v: i.productVariantId,
          q: i.quantity,
          tq: groupTotals[groupKeyByItemKey[i.cartItemKey]] ?? i.quantity,
          sp: i.bannerDetail?.sizePresetId ?? null,
          prints: (i.prints ?? []).map((pr) => `${pr.printAreaId}:${pr.printSizeId}`).sort(),
        })),
      ),
    [items, groupTotals, groupKeyByItemKey],
  )

  useEffect(() => {
    const generation = ++generationRef.current
    if (items.length === 0) {
      setPricingByKey({})
      setErrorsByKey({})
      setLoading(false)
      setError(null)
      setErrorKind(null)
      setCanRetry(false)
      return
    }

    setLoading(true)
    setError(null)
    setErrorKind(null)
    setCanRetry(false)
    // Old quotes must never make a new generation look complete. The subtotal retains the explicitly
    // gated persisted fallback until the authoritative batch completes.
    setPricingByKey({})
    setErrorsByKey({})

    // Debounce so rapid +/- clicks batch into a single round of quotes.
    const timeout = window.setTimeout(() => {
      const lines: Array<{ cartItemKey: string; request: PriceCalculationRequest }> = items.map((item) => {
        const groupKey = groupKeyByItemKey[item.cartItemKey]
        // FixedSize Banner lines quote from the selected size option: no variant, no prints, but a
        // bannerDetail carrying the sizePresetId (Jira 9517). The backend reads only that id for price.
        const isFixedSizeBanner = item.kind === 'Banner' && item.pricingModel === 'FixedSize'
        return {
          cartItemKey: item.cartItemKey,
          request: {
            productId: item.productId,
            variantId: item.productVariantId,
            quantity: item.quantity,
            // Group-aware tier scope: total quantity across the whole print pricing group.
            tierQuantity: groupTotals[groupKey] ?? item.quantity,
            prints: (item.prints ?? []).map((pr) => ({
              printAreaId: pr.printAreaId,
              printSizeId: pr.printSizeId,
            })),
            ...(isFixedSizeBanner && item.bannerDetail ? { bannerDetail: item.bannerDetail } : {}),
          },
        }
      })

      // Every generation is chained behind the previous one. Obsolete HTTP work can finish, but a
      // newer generation never overlaps it and stale results can never write state.
      const task = queueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (generation !== generationRef.current) return

          const unique = deduplicatePricingRequests(lines)
          const misses = unique.filter((entry) => !successfulQuoteCache.current.has(entry.fingerprint))
          const nextPricing: Record<string, CartLinePricing | undefined> = {}
          const nextErrors: Record<string, string | undefined> = {}

          let indexed:
            | ReturnType<typeof indexBatchResults>
            | undefined
          if (misses.length > 0) {
            const requestItems = misses.map(({ correlationKey, request }) => ({
              correlationKey,
              request,
            }))
            const { response } = await executeBatchWithRetry(
              requestItems,
              (batchItems) => pricingApi.calculateBatch(batchItems),
              {
                onRateLimit: () => {
                  if (generation === generationRef.current) {
                    setError(RATE_LIMIT_MESSAGE)
                    setErrorKind('rate-limit')
                  }
                },
              },
            )
            indexed = indexBatchResults(misses, response)
          }

          for (const entry of unique) {
            let quote = successfulQuoteCache.current.get(entry.fingerprint)
            let invalid = false
            if (!quote) {
              const result = indexed?.get(entry.correlationKey)
              if (result?.quote) {
                quote = toCartLinePricing(result.quote)
                successfulQuoteCache.current.set(entry.fingerprint, quote)
              } else {
                invalid = true
              }
            }

            for (const cartItemKey of entry.cartItemKeys) {
              if (quote) nextPricing[cartItemKey] = quote
              else if (invalid) nextErrors[cartItemKey] = INVALID_CONFIGURATION_MESSAGE
            }
          }

          if (generation !== generationRef.current) return
          setPricingByKey(nextPricing)
          setErrorsByKey(nextErrors)
          setError(null)
          setErrorKind(null)
          setCanRetry(false)
        })
        .catch((reason: unknown) => {
          if (generation !== generationRef.current) return
          const rateLimited = reason instanceof ApiError && reason.status === 429
          setError(rateLimited ? RATE_LIMIT_MESSAGE : GENERIC_PRICING_MESSAGE)
          setErrorKind(rateLimited ? 'rate-limit' : 'generic')
          setCanRetry(true)
        })
        .finally(() => {
          if (generation === generationRef.current) setLoading(false)
        })

      queueRef.current = task
    }, 300)

    return () => {
      window.clearTimeout(timeout)
    }
    // quoteSignature captures the meaningful contents of items + group totals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteSignature, retryToken])

  const isComplete =
    items.length > 0 &&
    !loading &&
    items.every((i) => Boolean(pricingByKey[i.cartItemKey]) && !errorsByKey[i.cartItemKey])

  const subtotal = items.reduce((sum, item) => {
    const fresh = pricingByKey[item.cartItemKey]
    return sum + (fresh ? fresh.lineTotal : item.unitPrice * item.quantity)
  }, 0)

  return {
    pricingByKey,
    errorsByKey,
    groupKeyByItemKey,
    groupTotals,
    loading,
    isComplete,
    subtotal,
    error,
    errorKind,
    canRetry,
    retry,
  }
}

/**
 * Small, non-intrusive print-tier hint for a cart line (Jira 9207). Returns null when no print tier
 * applies. groupQuantity is the total garment quantity across the line's print pricing group.
 *   - top tier:   "Best print price tier applied"
 *   - more to go: "Add 3 more in this print pricing group to reach $25.00 print"
 */
export function tierHint(line: CartLinePricing | undefined, groupQuantity: number): string | null {
  if (!line || line.pricingMode !== 'Tiered') return null
  if (line.nextTierMinQuantity == null || line.nextTierUnitPrintPrice == null) {
    return 'Best print price tier applied'
  }
  const remaining = line.nextTierMinQuantity - groupQuantity
  if (remaining <= 0) return 'Best print price tier applied'
  return `Add ${remaining} more in this print pricing group to reach $${line.nextTierUnitPrintPrice.toFixed(2)} print`
}
