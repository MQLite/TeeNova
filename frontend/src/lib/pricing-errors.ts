/**
 * Friendly copy for the per-item `errorCode` returned by `POST /api/pricing/calculate-batch`
 * (Jira 10304).
 *
 * The single-quote endpoint fails with an HTTP error whose body carries a localized message; the
 * batch endpoint instead reports a *per-item* ABP error code and keeps the rest of the batch
 * successful. This maps those codes to storefront copy so switching the product page to the batch
 * endpoint does not degrade the per-line message quality.
 *
 * Matching is by the final segment of the code ("TeeNova:Pricing:VariantUnavailable" →
 * "VariantUnavailable"), so it is namespace-independent — the same code can be raised from the
 * Pricing or PrintConfig namespace.
 */
const FRIENDLY_BY_CODE: Record<string, string> = {
  BelowMinimumQuantity:
    'The quantity is below this product’s minimum order quantity. Increase the quantity and try again.',
  InvalidQuantity: 'Enter a valid quantity for this line.',
  QuantityExceedsMaximum: 'That quantity is above the maximum we can price online.',
  ProductInactive: 'This product is no longer available.',
  VariantNotFound: 'This colour/size option is no longer available. Please refresh the page.',
  VariantUnavailable: 'This colour/size option is currently unavailable.',
  PrintAreaInactive: 'One of the selected print areas is no longer available. Choose another area.',
  PrintSizeInactive: 'One of the selected print sizes is no longer available. Choose another size.',
  PrintOptionNotAllowedForProduct:
    'The selected print size isn’t available for this garment size. Choose a different print size.',
  DesignRequired: 'This product requires a design upload before it can be ordered.',
  NoQuantityTiers: 'Pricing for this product isn’t configured yet. Please contact the shop.',
  UnsupportedPricingModel: 'This product can’t be priced online yet. Please contact the shop for a quote.',
  QuoteNotSupportedForPricingModel:
    'This product can’t be priced online yet. Please contact the shop for a quote.',
  InvalidConfiguration: 'This configuration can’t be priced. Please adjust your selection.',
}

const GENERIC_LINE_MESSAGE = 'Could not calculate pricing for this line.'

/** Friendly copy for a batch per-item error code. Unknown codes fall back to generic line copy. */
export function friendlyPricingErrorCode(
  code: string | null | undefined,
  fallback: string = GENERIC_LINE_MESSAGE,
): string {
  if (!code) return fallback
  const segment = code.split(':').pop()
  if (segment && FRIENDLY_BY_CODE[segment]) return FRIENDLY_BY_CODE[segment]
  return fallback
}
