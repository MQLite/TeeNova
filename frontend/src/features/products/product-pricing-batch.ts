import { friendlyPricingErrorCode } from '@/lib/pricing-errors'
import type {
  BatchPriceCalculationItem,
  BatchPriceCalculationResult,
  PriceCalculationPrintItem,
  PriceCalculationResponse,
} from '@/types'

/**
 * Batch-pricing request building and result mapping for the product-detail page (Jira 10304).
 *
 * Before 10304 the page issued one `POST /api/pricing/calculate` per selected variant line via
 * `Promise.allSettled` — a garment with quantities in twelve colour/size cells produced twelve
 * requests. This module drives the already-implemented `POST /api/pricing/calculate-batch` instead,
 * which returns equivalent authoritative quotes.
 *
 * The backend remains the sole pricing authority: nothing here computes, adjusts, or falls back to a
 * locally derived price. The only responsibility is (a) building the same request payloads that were
 * sent before, and (b) mapping each returned quote back to the line that asked for it.
 */

/** Backend cap on one batch (`BatchPriceCalculationRequestDto.Items`, MaxLength(50)). */
export const PRICING_BATCH_MAX_ITEMS = 50

export interface ProductPricingLine {
  variantId: string
  quantity: number
}

export interface ProductPricingBatchInput {
  productId: string
  lines: readonly ProductPricingLine[]
  /**
   * Total quantity of this product across every selected line. Identical for every line — it is the
   * print-tier scope, matching the backend order rule (Jira 9104/9207). Unchanged by this task.
   */
  tierQuantity: number
  prints: readonly PriceCalculationPrintItem[]
}

/**
 * The correlation key for a line.
 *
 * The variant id is the natural key: `buildSelectedVariantLines` emits at most one line per variant,
 * so it is unique within a batch, and it is a GUID (36 chars) which fits the backend's 64-character
 * `CorrelationKey` limit. It is opaque client data — the backend never uses it to select a product,
 * variant, option, tier or price.
 */
export function pricingCorrelationKey(line: ProductPricingLine): string {
  return line.variantId
}

/**
 * Builds the batch payloads, chunked to the backend's per-request item cap.
 *
 * Chunking matters here: a garment matrix of, say, ten colours × six sizes can exceed fifty priced
 * lines, which a single batch would reject outright.
 */
export function buildProductPricingBatches(
  input: ProductPricingBatchInput,
): BatchPriceCalculationItem[][] {
  const prints = input.prints.map((print) => ({
    printAreaId: print.printAreaId,
    printSizeId: print.printSizeId,
  }))

  const items: BatchPriceCalculationItem[] = input.lines.map((line) => ({
    correlationKey: pricingCorrelationKey(line),
    request: {
      productId: input.productId,
      variantId: line.variantId,
      quantity: line.quantity,
      tierQuantity: input.tierQuantity,
      prints,
    },
  }))

  const batches: BatchPriceCalculationItem[][] = []
  for (let index = 0; index < items.length; index += PRICING_BATCH_MAX_ITEMS) {
    batches.push(items.slice(index, index + PRICING_BATCH_MAX_ITEMS))
  }
  return batches
}

export interface ProductPricingBatchMapping {
  /** Authoritative quote per variant id. Absent for a line the backend rejected. */
  pricingByVariantId: Record<string, PriceCalculationResponse | undefined>
  /** Friendly per-line message for a rejected line, keyed by variant id. */
  errorsByVariantId: Record<string, string | undefined>
}

/**
 * Maps batch results back onto the submitted lines.
 *
 * Correlation is verified rather than assumed: an unexpected key, a duplicate key, or a missing
 * result throws instead of silently attaching one line's price to another line. The caller treats a
 * throw as "pricing unavailable", which blocks add-to-cart — the safe outcome.
 *
 * A result carrying an `errorCode` is a *partial* failure: that line gets a message and the other
 * lines keep their authoritative quotes, matching the previous `Promise.allSettled` behaviour.
 */
export function mapProductPricingBatchResults(
  lines: readonly ProductPricingLine[],
  results: readonly BatchPriceCalculationResult[],
): ProductPricingBatchMapping {
  const expected = new Map(lines.map((line) => [pricingCorrelationKey(line), line.variantId]))
  const seen = new Set<string>()

  const pricingByVariantId: Record<string, PriceCalculationResponse | undefined> = {}
  const errorsByVariantId: Record<string, string | undefined> = {}

  for (const result of results) {
    const variantId = expected.get(result.correlationKey)
    if (variantId === undefined || seen.has(result.correlationKey)) {
      throw new Error('The pricing service returned an invalid batch correlation.')
    }
    seen.add(result.correlationKey)

    if (result.quote) {
      pricingByVariantId[variantId] = result.quote
    } else {
      errorsByVariantId[variantId] = friendlyPricingErrorCode(result.errorCode)
    }
  }

  if (seen.size !== expected.size) {
    throw new Error('The pricing service returned an incomplete batch.')
  }

  return { pricingByVariantId, errorsByVariantId }
}
