import { ApiError } from '@/lib/api-client'
import type {
  BatchPriceCalculationItem,
  BatchPriceCalculationResponse,
  PriceCalculationRequest,
} from '@/types'

export const CART_PRICING_MAX_RETRIES = 2
export const CART_PRICING_DEFAULT_RETRY_MS = 1_000
export const CART_PRICING_JITTER_MS = 250

/** Recursively stable JSON used only for exact authoritative quote-payload identity. */
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stableValue(child)]),
    )
  }
  return value
}

/**
 * Includes every field sent to authoritative pricing. Print order is canonical because it has no
 * pricing meaning; all Banner fields are retained defensively even though the current server prices
 * FixedSize banners from sizePresetId alone.
 */
export function pricingFingerprint(request: PriceCalculationRequest): string {
  return JSON.stringify(
    stableValue({
      ...request,
      prints: [...request.prints].sort(
        (a, b) =>
          a.printAreaId.localeCompare(b.printAreaId) ||
          a.printSizeId.localeCompare(b.printSizeId),
      ),
    }),
  )
}

export interface UniquePricingRequest {
  correlationKey: string
  fingerprint: string
  request: PriceCalculationRequest
  cartItemKeys: string[]
}

/** Deduplicates exact price-bearing payloads without using cartItemKey as pricing authority. */
export function deduplicatePricingRequests(
  lines: ReadonlyArray<{ cartItemKey: string; request: PriceCalculationRequest }>,
): UniquePricingRequest[] {
  const byFingerprint = new Map<string, UniquePricingRequest>()

  for (const line of lines) {
    const fingerprint = pricingFingerprint(line.request)
    const existing = byFingerprint.get(fingerprint)
    if (existing) {
      existing.cartItemKeys.push(line.cartItemKey)
      continue
    }
    byFingerprint.set(fingerprint, {
      correlationKey: `q${byFingerprint.size}`,
      fingerprint,
      request: line.request,
      cartItemKeys: [line.cartItemKey],
    })
  }

  return Array.from(byFingerprint.values())
}

export interface BatchPricingAttemptOptions {
  maxRetries?: number
  defaultRetryMs?: number
  jitterMs?: number
  random?: () => number
  delay?: (milliseconds: number) => Promise<void>
  onRateLimit?: (attempt: number, delayMs: number) => void
}

export interface BatchPricingAttemptResult {
  response: BatchPriceCalculationResponse
  retries: number
}

/**
 * Executes one batch at a time. Only 429 is retried; Retry-After is a minimum and a small positive
 * jitter prevents clients released at the same instant from forming another burst.
 */
export async function executeBatchWithRetry(
  items: BatchPriceCalculationItem[],
  calculateBatch: (items: BatchPriceCalculationItem[]) => Promise<BatchPriceCalculationResponse>,
  options: BatchPricingAttemptOptions = {},
): Promise<BatchPricingAttemptResult> {
  const maxRetries = options.maxRetries ?? CART_PRICING_MAX_RETRIES
  const defaultRetryMs = options.defaultRetryMs ?? CART_PRICING_DEFAULT_RETRY_MS
  const jitterMs = options.jitterMs ?? CART_PRICING_JITTER_MS
  const random = options.random ?? Math.random
  const delay =
    options.delay ??
    ((milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds)))

  let retries = 0
  for (;;) {
    try {
      return { response: await calculateBatch(items), retries }
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 429 || retries >= maxRetries) throw error

      retries += 1
      const waitMs =
        Math.max(error.retryAfterMs ?? defaultRetryMs, defaultRetryMs) +
        Math.floor(random() * (jitterMs + 1))
      options.onRateLimit?.(retries, waitMs)
      await delay(waitMs)
    }
  }
}

/** Rejects missing, duplicate, and unknown correlation keys before any quote is mapped to a row. */
export function indexBatchResults(
  unique: readonly UniquePricingRequest[],
  response: BatchPriceCalculationResponse,
): Map<string, BatchPriceCalculationResponse['results'][number]> {
  const expected = new Set(unique.map((entry) => entry.correlationKey))
  const indexed = new Map<string, BatchPriceCalculationResponse['results'][number]>()

  for (const result of response.results) {
    if (!expected.has(result.correlationKey) || indexed.has(result.correlationKey)) {
      throw new Error('The pricing service returned an invalid batch correlation.')
    }
    indexed.set(result.correlationKey, result)
  }
  if (indexed.size !== expected.size) {
    throw new Error('The pricing service returned an incomplete batch.')
  }
  return indexed
}
