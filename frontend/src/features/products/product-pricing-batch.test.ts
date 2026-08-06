import { describe, expect, it } from 'vitest'
import {
  PRICING_BATCH_MAX_ITEMS,
  buildProductPricingBatches,
  mapProductPricingBatchResults,
} from './product-pricing-batch'
import type { BatchPriceCalculationResult, PriceCalculationResponse } from '@/types'

/**
 * Jira 10304 — the product page must use the existing batch endpoint while keeping per-line result
 * association exact, partial failures isolated, and the backend the only source of a price.
 */

const PRODUCT_ID = 'prod-1'

function quote(unitPrice: number, quantity: number): PriceCalculationResponse {
  return {
    productBasePrice: unitPrice,
    variantAdjustment: 0,
    printAddOns: [],
    garmentUnitPrice: unitPrice,
    printUnitPrice: 0,
    unitPrice,
    quantity,
    lineTotal: unitPrice * quantity,
    currency: 'NZD',
    pricingMode: 'Additive',
    appliedTierMinQuantity: null,
    appliedTierUnitPrice: null,
    nextTierMinQuantity: null,
    nextTierUnitPrice: null,
    includedStandardPrintAmount: 0,
  }
}

const lines = [
  { variantId: 'v-1', quantity: 4 },
  { variantId: 'v-2', quantity: 6 },
]

const prints = [{ printAreaId: 'area-front', printSizeId: 'size-a4' }]

describe('buildProductPricingBatches', () => {
  it('sends one item per line carrying the shared tier quantity and prints', () => {
    const [batch] = buildProductPricingBatches({
      productId: PRODUCT_ID,
      lines,
      tierQuantity: 10,
      prints,
    })

    expect(batch).toEqual([
      {
        correlationKey: 'v-1',
        request: { productId: PRODUCT_ID, variantId: 'v-1', quantity: 4, tierQuantity: 10, prints },
      },
      {
        correlationKey: 'v-2',
        request: { productId: PRODUCT_ID, variantId: 'v-2', quantity: 6, tierQuantity: 10, prints },
      },
    ])
  })

  it('sends no price field of any kind', () => {
    const [batch] = buildProductPricingBatches({
      productId: PRODUCT_ID,
      lines,
      tierQuantity: 10,
      prints,
    })

    const serialized = JSON.stringify(batch)
    for (const forbidden of ['unitPrice', 'lineTotal', 'basePrice', 'priceAdjustment']) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('chunks to the backend item cap so a large variant matrix is still priceable', () => {
    const many = Array.from({ length: PRICING_BATCH_MAX_ITEMS + 7 }, (_, index) => ({
      variantId: `v-${index}`,
      quantity: 1,
    }))

    const batches = buildProductPricingBatches({
      productId: PRODUCT_ID,
      lines: many,
      tierQuantity: many.length,
      prints,
    })

    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(PRICING_BATCH_MAX_ITEMS)
    expect(batches[1]).toHaveLength(7)
    expect(batches.flat().map((item) => item.correlationKey)).toEqual(many.map((l) => l.variantId))
  })

  it('produces correlation keys within the backend 64-character limit', () => {
    const [batch] = buildProductPricingBatches({
      productId: PRODUCT_ID,
      lines: [{ variantId: '3fa85f64-5717-4562-b3fc-2c963f66afa6', quantity: 1 }],
      tierQuantity: 1,
      prints,
    })

    expect(batch[0].correlationKey.length).toBeLessThanOrEqual(64)
  })

  it('returns no batch at all for no lines', () => {
    expect(
      buildProductPricingBatches({ productId: PRODUCT_ID, lines: [], tierQuantity: 0, prints }),
    ).toEqual([])
  })
})

describe('mapProductPricingBatchResults', () => {
  it('maps each quote back to the line that requested it, regardless of result order', () => {
    const results: BatchPriceCalculationResult[] = [
      { correlationKey: 'v-2', quote: quote(30, 6) },
      { correlationKey: 'v-1', quote: quote(20, 4) },
    ]

    const mapped = mapProductPricingBatchResults(lines, results)

    expect(mapped.pricingByVariantId['v-1']?.unitPrice).toBe(20)
    expect(mapped.pricingByVariantId['v-2']?.unitPrice).toBe(30)
    expect(mapped.errorsByVariantId).toEqual({})
  })

  it('isolates a partial failure to its own line with friendly copy', () => {
    const results: BatchPriceCalculationResult[] = [
      { correlationKey: 'v-1', quote: quote(20, 4) },
      { correlationKey: 'v-2', quote: null, errorCode: 'TeeNova:Pricing:VariantUnavailable' },
    ]

    const mapped = mapProductPricingBatchResults(lines, results)

    expect(mapped.pricingByVariantId['v-1']?.unitPrice).toBe(20)
    expect(mapped.pricingByVariantId['v-2']).toBeUndefined()
    expect(mapped.errorsByVariantId['v-2']).toMatch(/currently unavailable/i)
    expect(mapped.errorsByVariantId['v-2']).not.toContain('TeeNova:')
  })

  it('falls back to generic line copy for an unrecognised error code', () => {
    const mapped = mapProductPricingBatchResults(
      [lines[0]],
      [{ correlationKey: 'v-1', quote: null, errorCode: 'TeeNova:Pricing:SomethingNew' }],
    )

    expect(mapped.errorsByVariantId['v-1']).toBe('Could not calculate pricing for this line.')
  })

  it('refuses an unexpected correlation key rather than mis-attributing a price', () => {
    expect(() =>
      mapProductPricingBatchResults(lines, [
        { correlationKey: 'v-1', quote: quote(20, 4) },
        { correlationKey: 'v-999', quote: quote(999, 1) },
      ]),
    ).toThrow(/invalid batch correlation/i)
  })

  it('refuses a duplicated correlation key', () => {
    expect(() =>
      mapProductPricingBatchResults(lines, [
        { correlationKey: 'v-1', quote: quote(20, 4) },
        { correlationKey: 'v-1', quote: quote(21, 4) },
      ]),
    ).toThrow(/invalid batch correlation/i)
  })

  it('refuses an incomplete result set', () => {
    expect(() =>
      mapProductPricingBatchResults(lines, [{ correlationKey: 'v-1', quote: quote(20, 4) }]),
    ).toThrow(/incomplete batch/i)
  })
})
