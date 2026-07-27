import { ApiError } from '@/lib/api-client'

/**
 * Backend payment BusinessException codes the customer checkout branches on (Stripe surcharge, Phase 3/4).
 * Matching is by the final segment of the ABP code, mirroring the Banner/Badge error helpers.
 */
export const PaymentErrorCodes = {
  /** Surcharge is enabled but no quote fingerprint was submitted. */
  QuoteRequired: 'StripeSurchargeQuoteRequired',
  /** The submitted fingerprint no longer matches the current server quote. */
  QuoteStale: 'StripeSurchargeQuoteStale',
  /** The persisted surcharge configuration is invalid — Stripe cannot be used right now. */
  ConfigurationInvalid: 'StripeSurchargeConfigurationInvalid',
  /** An amount is not exactly cent-aligned; the shop must correct the order total. */
  AmountPrecisionInvalid: 'StripeAmountPrecisionInvalid',
  /** The configured currency is not supported by the surcharge calculation. */
  CurrencyUnsupported: 'StripeCurrencyUnsupported',
} as const

export type PaymentErrorCode = (typeof PaymentErrorCodes)[keyof typeof PaymentErrorCodes]

/**
 * How the UI must react:
 * - `quote-required` / `quote-stale` — clear the fingerprint, fetch a fresh quote, show the updated
 *   amount, and require another deliberate click. Never auto-resubmit and never redirect.
 * - `blocked` — Stripe cannot be used with the current configuration; the customer should choose another
 *   payment method or contact the shop. Refetching would not help.
 * - `generic` — anything else; existing failure handling applies.
 */
export type PaymentErrorKind = 'quote-required' | 'quote-stale' | 'blocked' | 'generic'

export interface ClassifiedPaymentError {
  /** Retained for branching and tests; never rendered to an ordinary customer. */
  code: string | null
  kind: PaymentErrorKind
  /** Customer-safe copy. Never a stack trace, HTTP internal, or raw backend exception text. */
  message: string
}

const FRIENDLY_BY_CODE: Record<string, string> = {
  [PaymentErrorCodes.QuoteRequired]:
    'We need to confirm the current card payment total before continuing. Please review the updated amount and try again.',
  [PaymentErrorCodes.QuoteStale]:
    'The card payment total changed. Please review the updated amount and continue again.',
  [PaymentErrorCodes.ConfigurationInvalid]:
    'Card payments are temporarily unavailable. Please choose another payment method or contact the shop.',
  [PaymentErrorCodes.AmountPrecisionInvalid]:
    'This order total can’t be charged by card right now. Please contact the shop so we can correct it.',
  [PaymentErrorCodes.CurrencyUnsupported]:
    'Card payments are temporarily unavailable for this order. Please choose another payment method or contact the shop.',
}

const KIND_BY_CODE: Record<string, PaymentErrorKind> = {
  [PaymentErrorCodes.QuoteRequired]: 'quote-required',
  [PaymentErrorCodes.QuoteStale]: 'quote-stale',
  [PaymentErrorCodes.ConfigurationInvalid]: 'blocked',
  [PaymentErrorCodes.AmountPrecisionInvalid]: 'blocked',
  [PaymentErrorCodes.CurrencyUnsupported]: 'blocked',
}

const GENERIC_QUOTE_FAILURE =
  'We couldn’t calculate the current card payment total. Please try again or choose another payment method.'

const GENERIC_SESSION_FAILURE =
  'The online payment session could not be created. You can still arrange payment manually with the shop.'

/** Final segment of the ABP error code (e.g. "TeeNova:Payment:StripeSurchargeQuoteStale"). */
export function extractPaymentErrorCode(err: unknown): string | null {
  if (err instanceof ApiError) {
    const code = (err.details as { error?: { code?: string } } | undefined)?.error?.code
    if (typeof code === 'string' && code.length > 0) return code.split(':').pop() ?? null
  }
  return null
}

/**
 * Classifies a failed quote request. Only known business codes produce specific copy; everything else
 * falls back to the generic line, so no raw backend text reaches the customer.
 */
export function classifyQuoteError(err: unknown): ClassifiedPaymentError {
  const code = extractPaymentErrorCode(err)

  if (code && FRIENDLY_BY_CODE[code]) {
    return { code, kind: KIND_BY_CODE[code] ?? 'generic', message: FRIENDLY_BY_CODE[code] }
  }

  return { code, kind: 'generic', message: GENERIC_QUOTE_FAILURE }
}

/**
 * Classifies a failed payment-session creation. Known surcharge codes keep their specific copy and kind;
 * anything else keeps the pre-existing generic session-failure behaviour (server message when present).
 */
export function classifySessionError(
  err: unknown,
  fallback: string = GENERIC_SESSION_FAILURE,
): ClassifiedPaymentError {
  const code = extractPaymentErrorCode(err)

  if (code && FRIENDLY_BY_CODE[code]) {
    return { code, kind: KIND_BY_CODE[code] ?? 'generic', message: FRIENDLY_BY_CODE[code] }
  }

  return {
    code,
    kind: 'generic',
    message: err instanceof Error && err.message ? err.message : fallback,
  }
}

/** True when the failure means Stripe must be refreshed and re-confirmed rather than simply retried. */
export function requiresFreshQuote(kind: PaymentErrorKind): boolean {
  return kind === 'quote-required' || kind === 'quote-stale'
}
