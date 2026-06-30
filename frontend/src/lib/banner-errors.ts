import { ApiError } from '@/lib/api-client'

/**
 * Maps backend Banner enquiry / config / checkout-guard BusinessException codes (Jira 9511/9512) to
 * friendly storefront copy. Matching is by the final segment of the ABP error code (e.g.
 * "TeeNova:BannerEnquiry:BannerEnquiryDesignRequired" → "BannerEnquiryDesignRequired"), so it works
 * regardless of namespace. Falls back to the server-localized message, then a generic line.
 */
const FRIENDLY_BY_CODE: Record<string, string> = {
  // Enquiry product/validation
  BannerEnquiryProductRequired: 'Please choose a product before requesting a quote.',
  BannerEnquiryProductNotFound: 'This product could not be found. Please refresh and try again.',
  BannerEnquiryProductNotAvailable: 'This product is no longer available.',
  BannerEnquiryRequiresBannerProduct: 'This product is not a banner. Please use its normal product page.',
  BannerEnquiryRequiresCustomQuoteOnly: 'This banner is not set up for quote requests. Please contact the shop.',
  BannerEnquiryQuantityBelowMinimum: 'The quantity is below this banner’s minimum order quantity. Increase it and try again.',
  BannerEnquiryDesignRequired: 'Please upload your artwork before requesting a quote.',
  // Banner detail validation (shared with 9511)
  BannerDetailRequired: 'Please complete the banner details before requesting a quote.',
  InvalidBannerDetail: 'Some banner details are invalid. Please review and try again.',
  InvalidBannerSizeMode: 'Choose whether the size is a preset or custom dimensions.',
  BannerDimensionsRequired: 'Enter the width and height for a custom size.',
  InvalidBannerUnit: 'Choose a unit (mm, cm, or m) for your dimensions.',
  BannerMaterialRequired: 'Choose a material. If “Other”, please name the material.',
  InvalidBannerDimensions: 'The dimensions entered are not valid. Please check and try again.',
  InvalidBannerPreset: 'Choose a preset size or enter a size label.',
  BannerNotesTooLong: 'Your notes are too long. Please shorten them.',
  // Checkout guards (9511)
  QuoteOnlyProductCannotCheckout: 'Banners are quote-only. Submit a quote request instead of paying online.',
  CustomQuoteOnlyRequiresEnquiry: 'Banners are quote-only. Submit a quote request instead of paying online.',
  // Admin conversion (9513)
  BannerQuoteRequestNotFound: 'This quote request could not be found. It may have been removed.',
  BannerQuoteRequestAlreadyConverted: 'This quote request has already been converted to an order.',
  BannerQuoteRequestCancelled: 'This quote request was cancelled and can’t be converted.',
  BannerQuoteRequestCannotConvert: 'This quote request can’t be converted in its current status.',
  BannerQuoteRequiresPositiveTotal: 'Enter a quote total greater than 0 to convert this request.',
  BannerQuoteConversionFailed: 'The quote request could not be converted. Please review the details and try again.',
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

/** Returns friendly copy for a Banner error, falling back to the server message then `fallback`. */
export function friendlyBannerError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const code = extractCode(err)
  if (code && FRIENDLY_BY_CODE[code]) return FRIENDLY_BY_CODE[code]
  if (err instanceof Error && err.message) return err.message
  return fallback
}
