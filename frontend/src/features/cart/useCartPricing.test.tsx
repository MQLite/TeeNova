import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-client'
import { useCartPricing } from './useCartPricing'
import type {
  BatchPriceCalculationItem,
  BatchPriceCalculationResponse,
  CartItem,
  PriceCalculationResponse,
} from '@/types'

const calculateBatch = vi.fn<
  (items: BatchPriceCalculationItem[]) => Promise<BatchPriceCalculationResponse>
>()

vi.mock('@/api/pricing', () => ({
  pricingApi: {
    calculateBatch: (items: BatchPriceCalculationItem[]) => calculateBatch(items),
  },
}))
vi.mock('@/api/catalog', () => ({
  catalogApi: { getProduct: vi.fn() },
}))

function item(index: number, overrides: Partial<CartItem> = {}): CartItem {
  return {
    cartItemKey: `key-${index}`,
    productId: 'product-1',
    productVariantId: `variant-${index}`,
    productName: 'Tee',
    color: 'Blue',
    size: `S${index}`,
    unitPrice: 30,
    quantity: 1,
    printPricingGroupId: null,
    prints: [{ printAreaId: 'front', printAreaName: 'Front', printSizeId: 'a3', printSizeName: 'A3' }],
    ...overrides,
  }
}

function quote(request: BatchPriceCalculationItem['request'], unitPrice = 25): PriceCalculationResponse {
  return {
    productBasePrice: unitPrice,
    variantAdjustment: 0,
    printAddOns: [],
    garmentUnitPrice: unitPrice,
    printUnitPrice: 0,
    unitPrice,
    quantity: request.quantity,
    lineTotal: unitPrice * request.quantity,
    currency: 'NZD',
    pricingMode: 'Additive',
    appliedTierMinQuantity: null,
    appliedTierUnitPrice: null,
    nextTierMinQuantity: null,
    nextTierUnitPrice: null,
    includedStandardPrintAmount: 0,
  }
}

function success(items: BatchPriceCalculationItem[], unitPrice = 25): BatchPriceCalculationResponse {
  return {
    results: items.map((entry) => ({
      correlationKey: entry.correlationKey,
      quote: quote(entry.request, unitPrice),
    })),
  }
}

async function runDebounce(milliseconds = 301) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds)
  })
  await settle()
}

async function settle() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  calculateBatch.mockImplementation(async (items) => success(items))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useCartPricing batch generations', () => {
  it('sends no pricing request for an empty cart', async () => {
    const { result } = renderHook(() => useCartPricing([]))
    await runDebounce()
    expect(calculateBatch).not.toHaveBeenCalled()
    expect(result.current.isComplete).toBe(false)
  })

  it.each([1, 5, 10, 20])('prices %i lines in one HTTP batch', async (count) => {
    const items = Array.from({ length: count }, (_, index) => item(index))
    const { result } = renderHook(() => useCartPricing(items))
    await runDebounce()

    expect(result.current.isComplete).toBe(true)
    expect(calculateBatch).toHaveBeenCalledTimes(1)
    expect(calculateBatch.mock.calls[0][0]).toHaveLength(count)
  })

  it('coalesces rapid quantity changes before the debounce boundary', async () => {
    const { result, rerender } = renderHook(
      ({ items }: { items: CartItem[] }) => useCartPricing(items),
      { initialProps: { items: [item(1)] } },
    )
    rerender({ items: [item(1, { quantity: 2 })] })
    rerender({ items: [item(1, { quantity: 3 })] })
    rerender({ items: [item(1, { quantity: 4 })] })
    await runDebounce()

    expect(result.current.isComplete).toBe(true)
    expect(calculateBatch).toHaveBeenCalledTimes(1)
    expect(calculateBatch.mock.calls[0][0][0].request.quantity).toBe(4)
  })

  it('serializes generations and prevents a stale response overwriting a newer quote', async () => {
    let resolveFirst!: (response: BatchPriceCalculationResponse) => void
    calculateBatch
      .mockImplementationOnce(
        (items) =>
          new Promise((resolve) => {
            resolveFirst = () => resolve(success(items, 10))
          }),
      )
      .mockImplementationOnce(async (items) => success(items, 40))

    const { result, rerender } = renderHook(
      ({ items }: { items: CartItem[] }) => useCartPricing(items),
      { initialProps: { items: [item(1)] } },
    )
    await runDebounce()
    rerender({ items: [item(1, { quantity: 2 })] })
    await runDebounce()
    expect(calculateBatch).toHaveBeenCalledTimes(1)

    await act(async () => resolveFirst(success(calculateBatch.mock.calls[0][0], 10)))
    await settle()
    expect(calculateBatch).toHaveBeenCalledTimes(2)
    await settle()
    expect(result.current.isComplete).toBe(true)
    expect(result.current.pricingByKey['key-1']?.unitPrice).toBe(40)
    expect(result.current.pricingByKey['key-1']?.lineTotal).toBe(80)
  })

  it('does not attach a late result to a removed line', async () => {
    let resolveFirst!: (response: BatchPriceCalculationResponse) => void
    calculateBatch
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockImplementationOnce(async (items) => success(items))

    const { result, rerender } = renderHook(
      ({ items }: { items: CartItem[] }) => useCartPricing(items),
      { initialProps: { items: [item(1), item(2)] } },
    )
    await runDebounce()
    rerender({ items: [item(1)] })
    await runDebounce()
    await act(async () => resolveFirst(success(calculateBatch.mock.calls[0][0])))
    await settle()

    await settle()
    expect(result.current.isComplete).toBe(true)
    expect(result.current.pricingByKey['key-2']).toBeUndefined()
    expect(Object.keys(result.current.pricingByKey)).toEqual(['key-1'])
  })

  it('clears the transient cart message after a successful Retry-After retry', async () => {
    calculateBatch
      .mockRejectedValueOnce(new ApiError(429, 'slow down', undefined, 1_000))
      .mockImplementationOnce(async (items) => success(items))
    const { result } = renderHook(() => useCartPricing([item(1)]))
    await runDebounce()
    expect(result.current.errorKind).toBe('rate-limit')
    await runDebounce(1_001)
    expect(result.current.isComplete).toBe(true)
    expect(result.current.error).toBeNull()
    expect(calculateBatch).toHaveBeenCalledTimes(2)
  })

  it('caps 429 retries and exposes one retryable cart-level error', async () => {
    calculateBatch.mockRejectedValue(new ApiError(429, 'slow down', undefined, 1_000))
    const { result } = renderHook(() => useCartPricing([item(1)]))
    await runDebounce()
    await runDebounce(2_100)

    expect(result.current.loading).toBe(false)
    expect(calculateBatch).toHaveBeenCalledTimes(3)
    expect(result.current.errorKind).toBe('rate-limit')
    expect(result.current.canRetry).toBe(true)
    expect(result.current.errorsByKey).toEqual({})
    expect(result.current.isComplete).toBe(false)
  })

  it('keeps invalid configuration line-level and classifies a network failure honestly', async () => {
    calculateBatch.mockImplementationOnce(async (entries) => ({
      results: entries.map((entry) => ({
        correlationKey: entry.correlationKey,
        errorCode: 'TeeNova:Pricing:PrintSizeNotAllowed',
      })),
    }))
    const { result, rerender } = renderHook(
      ({ items }: { items: CartItem[] }) => useCartPricing(items),
      { initialProps: { items: [item(1)] } },
    )
    await runDebounce()
    expect(result.current.loading).toBe(false)
    expect(result.current.errorsByKey['key-1']).toMatch(/print option may no longer be available/i)
    expect(result.current.errorKind).toBeNull()

    calculateBatch.mockRejectedValueOnce(new Error('offline'))
    rerender({ items: [item(1, { quantity: 2 })] })
    await runDebounce()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toMatch(/couldn't refresh prices/i)
    expect(result.current.error).not.toMatch(/print option/i)
    expect(result.current.errorKind).toBe('generic')
    expect(result.current.isComplete).toBe(false)
  })
})
