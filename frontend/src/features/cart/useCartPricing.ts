'use client'

import { useEffect, useMemo, useState } from 'react'
import { pricingApi } from '@/api/pricing'
import type { CartItem, PriceCalculationResponse } from '@/types'

export interface CartLinePricing {
  unitPrice: number
  lineTotal: number
  pricingMode: PriceCalculationResponse['pricingMode']
  appliedTierMinQuantity: number | null
  nextTierMinQuantity: number | null
  nextTierUnitPrice: number | null
  includedStandardPrintAmount: number
  hasExtraPrints: boolean
  currency: string
}

export interface CartPricingResult {
  /** Recalculated pricing per cartItemKey. Undefined while loading or if that line errored. */
  pricingByKey: Record<string, CartLinePricing | undefined>
  /** Per-line error messages keyed by cartItemKey. */
  errorsByKey: Record<string, string | undefined>
  /** Total quantity per productId (the tier scope) — same value drives every line of that product. */
  productTotals: Record<string, number>
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

/** Stable signature so the effect only re-runs on a meaningful change (avoids render loops). */
function signatureOf(items: CartItem[]): string {
  return JSON.stringify(
    items.map((i) => ({
      k: i.cartItemKey,
      p: i.productId,
      v: i.productVariantId,
      q: i.quantity,
      prints: (i.prints ?? [])
        .map((pr) => `${pr.printAreaId}:${pr.printSizeId}`)
        .sort(),
    })),
  )
}

/**
 * Recalculates cart line pricing through the backend quote API, applying quantity-break tiers
 * with tierQuantity aggregated per product across variants (Jira 9105). Backend stays the source
 * of truth for the final order; this only refreshes the displayed prices.
 */
export function useCartPricing(items: CartItem[]): CartPricingResult {
  const signature = useMemo(() => signatureOf(items), [items])

  // Tier scope: total quantity per product across all its variant lines in the cart.
  const productTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const item of items) {
      totals[item.productId] = (totals[item.productId] ?? 0) + item.quantity
    }
    return totals
  }, [items])

  const [pricingByKey, setPricingByKey] = useState<Record<string, CartLinePricing | undefined>>({})
  const [errorsByKey, setErrorsByKey] = useState<Record<string, string | undefined>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      const lines = items.map((item) => ({
        key: item.cartItemKey,
        request: {
          productId: item.productId,
          variantId: item.productVariantId,
          quantity: item.quantity,
          tierQuantity: productTotals[item.productId],
          prints: (item.prints ?? []).map((pr) => ({
            printAreaId: pr.printAreaId,
            printSizeId: pr.printSizeId,
          })),
        },
      }))

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
                unitPrice: r.unitPrice,
                lineTotal: r.lineTotal,
                pricingMode: r.pricingMode,
                appliedTierMinQuantity: r.appliedTierMinQuantity,
                nextTierMinQuantity: r.nextTierMinQuantity,
                nextTierUnitPrice: r.nextTierUnitPrice,
                includedStandardPrintAmount: r.includedStandardPrintAmount,
                hasExtraPrints: r.printAddOns.length > 0,
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
    // signature captures the meaningful contents of items; productTotals derives from the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  const isComplete =
    items.length > 0 &&
    !loading &&
    items.every((i) => Boolean(pricingByKey[i.cartItemKey]) && !errorsByKey[i.cartItemKey])

  const subtotal = items.reduce((sum, item) => {
    const fresh = pricingByKey[item.cartItemKey]
    return sum + (fresh ? fresh.lineTotal : item.unitPrice * item.quantity)
  }, 0)

  return { pricingByKey, errorsByKey, productTotals, loading, isComplete, subtotal, error }
}

/**
 * Small, non-intrusive tier hint for a cart line. Returns null when no tier is applied.
 *   - top tier:        "Best tier applied"
 *   - more to go:      "Add 3 more to reach $25.00 ea"
 */
export function tierHint(line: CartLinePricing | undefined, productTotalQuantity: number): string | null {
  if (!line || line.pricingMode !== 'Tiered') return null
  if (line.nextTierMinQuantity == null || line.nextTierUnitPrice == null) return 'Best tier applied'
  const remaining = line.nextTierMinQuantity - productTotalQuantity
  if (remaining <= 0) return 'Best tier applied'
  return `Add ${remaining} more to reach $${line.nextTierUnitPrice.toFixed(2)} ea`
}
