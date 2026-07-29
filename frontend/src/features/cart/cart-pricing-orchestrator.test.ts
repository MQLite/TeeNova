import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-client'
import {
  deduplicatePricingRequests,
  executeBatchWithRetry,
  indexBatchResults,
  pricingFingerprint,
} from './cart-pricing-orchestrator'
import type { PriceCalculationRequest } from '@/types'

function request(overrides: Partial<PriceCalculationRequest> = {}): PriceCalculationRequest {
  return {
    productId: 'product-1',
    variantId: 'variant-1',
    quantity: 1,
    tierQuantity: 10,
    prints: [{ printAreaId: 'area-front', printSizeId: 'size-a3' }],
    ...overrides,
  }
}

describe('pricingFingerprint and deduplication', () => {
  it('handles an empty cart without work', () => {
    expect(deduplicatePricingRequests([])).toEqual([])
  })

  it('shares work for identical complete payloads and preserves every cartItemKey', () => {
    const unique = deduplicatePricingRequests([
      { cartItemKey: 'a', request: request() },
      { cartItemKey: 'b', request: request() },
    ])
    expect(unique).toHaveLength(1)
    expect(unique[0].cartItemKeys).toEqual(['a', 'b'])
  })

  it('does not deduplicate different variants', () => {
    expect(
      deduplicatePricingRequests([
        { cartItemKey: 'a', request: request({ variantId: 'variant-a' }) },
        { cartItemKey: 'b', request: request({ variantId: 'variant-b' }) },
      ]),
    ).toHaveLength(2)
  })

  it('invalidates identity when tier quantity changes', () => {
    expect(pricingFingerprint(request({ tierQuantity: 10 }))).not.toBe(
      pricingFingerprint(request({ tierQuantity: 20 })),
    )
  })

  it('invalidates identity when prints change but ignores print order', () => {
    const first = request({
      prints: [
        { printAreaId: 'back', printSizeId: 'a4' },
        { printAreaId: 'front', printSizeId: 'a3' },
      ],
    })
    const reordered = request({ prints: [...first.prints].reverse() })
    const changed = request({ prints: [{ printAreaId: 'front', printSizeId: 'a4' }] })
    expect(pricingFingerprint(first)).toBe(pricingFingerprint(reordered))
    expect(pricingFingerprint(first)).not.toBe(pricingFingerprint(changed))
  })

  it('does not mutate input requests or print arrays', () => {
    const input = request({
      prints: [
        { printAreaId: 'front', printSizeId: 'a3' },
        { printAreaId: 'back', printSizeId: 'a4' },
      ],
    })
    const snapshot = structuredClone(input)
    deduplicatePricingRequests([{ cartItemKey: 'a', request: input }])
    expect(input).toEqual(snapshot)
  })
})

describe('batch retry and correlation safety', () => {
  const item = { correlationKey: 'q0', request: request() }
  const ok = { results: [{ correlationKey: 'q0', quote: null, errorCode: 'invalid' }] }

  it('respects Retry-After and adds controlled jitter before a successful retry', async () => {
    const calculate = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(429, 'slow down', undefined, 2_000))
      .mockResolvedValueOnce(ok)
    const delay = vi.fn().mockResolvedValue(undefined)

    const result = await executeBatchWithRetry([item], calculate, {
      delay,
      random: () => 0.5,
      jitterMs: 200,
    })

    expect(delay).toHaveBeenCalledWith(2_100)
    expect(result.retries).toBe(1)
    expect(calculate).toHaveBeenCalledTimes(2)
  })

  it('caps retry count', async () => {
    const failure = new ApiError(429, 'slow down', undefined, 1)
    const calculate = vi.fn().mockRejectedValue(failure)
    const delay = vi.fn().mockResolvedValue(undefined)

    await expect(
      executeBatchWithRetry([item], calculate, { delay, maxRetries: 2, jitterMs: 0 }),
    ).rejects.toBe(failure)
    expect(calculate).toHaveBeenCalledTimes(3)
    expect(delay).toHaveBeenCalledTimes(2)
  })

  it('does not retry generic network errors', async () => {
    const calculate = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(executeBatchWithRetry([item], calculate)).rejects.toThrow('offline')
    expect(calculate).toHaveBeenCalledTimes(1)
  })

  it('rejects unknown, duplicate, or missing response correlations', () => {
    const unique = deduplicatePricingRequests([{ cartItemKey: 'a', request: request() }])
    expect(() => indexBatchResults(unique, { results: [{ correlationKey: 'wrong', quote: null }] }))
      .toThrow(/correlation/i)
    expect(() => indexBatchResults(unique, { results: [] })).toThrow(/incomplete/i)
    expect(() =>
      indexBatchResults(unique, {
        results: [
          { correlationKey: 'q0', quote: null },
          { correlationKey: 'q0', quote: null },
        ],
      }),
    ).toThrow(/correlation/i)
  })
})
