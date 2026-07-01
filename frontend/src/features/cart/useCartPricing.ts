'use client'

import { useEffect, useMemo, useState } from 'react'
import { pricingApi } from '@/api/pricing'
import { catalogApi } from '@/api/catalog'
import type { CartItem, PriceCalculationResponse } from '@/types'

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
    if (items.length === 0) {
      setPricingByKey({})
      setErrorsByKey({})
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    // Debounce so rapid +/- clicks batch into a single round of quotes.
    const timeout = window.setTimeout(() => {
      // Snapshot the lines for this run so indexes line up with results.
      const lines = items.map((item) => {
        const groupKey = groupKeyByItemKey[item.cartItemKey]
        // FixedSize Banner lines quote from the selected size option: no variant, no prints, but a
        // bannerDetail carrying the sizePresetId (Jira 9517). The backend reads only that id for price.
        const isFixedSizeBanner = item.kind === 'Banner' && item.pricingModel === 'FixedSize'
        return {
          key: item.cartItemKey,
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

      Promise.allSettled(lines.map((l) => pricingApi.calculatePricing(l.request)))
        .then((results) => {
          if (cancelled) return

          const nextPricing: Record<string, CartLinePricing | undefined> = {}
          const nextErrors: Record<string, string | undefined> = {}

          results.forEach((result, index) => {
            const line = lines[index]
            if (!line) return
            if (result.status === 'fulfilled') {
              const r = result.value
              nextPricing[line.key] = {
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
            } else {
              nextErrors[line.key] =
                result.reason instanceof Error
                  ? result.reason.message
                  : 'Could not refresh pricing for this item.'
            }
          })

          setPricingByKey(nextPricing)
          setErrorsByKey(nextErrors)
          setError(
            Object.keys(nextErrors).length === lines.length
              ? 'Pricing could not be refreshed. Please try again.'
              : null,
          )
        })
        .catch(() => {
          if (cancelled) return
          setPricingByKey({})
          setErrorsByKey({})
          setError('Pricing could not be refreshed. Please try again.')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
    // quoteSignature captures the meaningful contents of items + group totals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteSignature])

  const isComplete =
    items.length > 0 &&
    !loading &&
    items.every((i) => Boolean(pricingByKey[i.cartItemKey]) && !errorsByKey[i.cartItemKey])

  const subtotal = items.reduce((sum, item) => {
    const fresh = pricingByKey[item.cartItemKey]
    return sum + (fresh ? fresh.lineTotal : item.unitPrice * item.quantity)
  }, 0)

  return { pricingByKey, errorsByKey, groupKeyByItemKey, groupTotals, loading, isComplete, subtotal, error }
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
