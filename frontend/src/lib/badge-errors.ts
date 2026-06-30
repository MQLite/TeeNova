import { ApiError } from '@/lib/api-client'

/**
 * Maps backend Badge/pricing BusinessException codes (Jira 9503/9504) to friendly storefront copy.
 * Matching is by the final segment of the ABP error code (e.g. "TeeNova:Pricing:BelowMinimumQuantity"
 * → "BelowMinimumQuantity") so it works regardless of the namespace the backend raised it under.
 * Falls back to the server-localized message, then a generic line.
 */
const FRIENDLY_BY_CODE: Record<string, string> = {
  BelowMinimumQuantity: 'The quantity is below this product’s minimum order quantity. Increase the quantity and try again.',
  DesignRequired: 'This product requires a design upload before it can be ordered. Please upload your artwork.',
  NoQuantityTiers: 'Pricing for this product isn’t configured yet. Please contact the shop.',
  QuantityTierUnitDoesNotSupportPrints: 'This product is priced by quantity only and doesn’t take print placements.',
  UnsupportedPricingModel: 'This product can’t be priced online yet. Please contact the shop for a quote.',
  QuoteNotSupportedForPricingModel: 'This product can’t be priced online yet. Please contact the shop for a quote.',
  InvalidPricingModelForKind: 'This product is misconfigured (kind/pricing model mismatch). Please contact the shop.',
  VariantNotFound: 'The selected option is no longer available. Please refresh and try again.',
  ProductInactive: 'This product is no longer available.',
  InvalidQuantity: 'Enter a valid quantity.',
}

function extractCode(err: unknown): string | undefined {
  if (err instanceof ApiError) {
    const code = (err.details as { error?: { code?: string } } | undefined)?.error?.code
    if (typeof code === 'string' && code.length > 0) {
      return code.split(':').pop()
    }
  }
  return undefined
}

/** Returns friendly copy for a Badge/pricing error, falling back to the server message then `fallback`. */
export function friendlyBadgeError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const code = extractCode(err)
  if (code && FRIENDLY_BY_CODE[code]) return FRIENDLY_BY_CODE[code]
  if (err instanceof Error && err.message) return err.message
  return fallback
}
