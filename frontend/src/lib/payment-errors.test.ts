import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api-client'
import {
  PaymentErrorCodes,
  classifyQuoteError,
  classifySessionError,
  extractPaymentErrorCode,
  requiresFreshQuote,
} from './payment-errors'

function businessError(code: string, message = 'server message'): ApiError {
  return new ApiError(403, message, { error: { code, message } })
}

describe('extractPaymentErrorCode', () => {
  it('returns the final segment of an ABP business code', () => {
    expect(extractPaymentErrorCode(businessError('TeeNova:Payment:StripeSurchargeQuoteStale'))).toBe(
      'StripeSurchargeQuoteStale',
    )
  })

  it('returns null for a plain error', () => {
    expect(extractPaymentErrorCode(new Error('boom'))).toBeNull()
    expect(extractPaymentErrorCode(undefined)).toBeNull()
  })
})

describe('classifySessionError', () => {
  it.each([
    [PaymentErrorCodes.QuoteRequired, 'quote-required'],
    [PaymentErrorCodes.QuoteStale, 'quote-stale'],
    [PaymentErrorCodes.ConfigurationInvalid, 'blocked'],
    [PaymentErrorCodes.AmountPrecisionInvalid, 'blocked'],
    [PaymentErrorCodes.CurrencyUnsupported, 'blocked'],
  ])('maps %s to the %s kind', (code, kind) => {
    const classified = classifySessionError(businessError(`TeeNova:Payment:${code}`))

    expect(classified.code).toBe(code)
    expect(classified.kind).toBe(kind)
  })

  it('only quote-required and quote-stale trigger the fresh-quote flow', () => {
    expect(requiresFreshQuote('quote-required')).toBe(true)
    expect(requiresFreshQuote('quote-stale')).toBe(true)
    expect(requiresFreshQuote('blocked')).toBe(false)
    expect(requiresFreshQuote('generic')).toBe(false)
  })

  it('tells the customer to review the updated amount when the quote is stale', () => {
    const classified = classifySessionError(
      businessError(`TeeNova:Payment:${PaymentErrorCodes.QuoteStale}`),
    )

    expect(classified.message).toBe(
      'The card payment total changed. Please review the updated amount and continue again.',
    )
  })

  it('advises another payment method when Stripe is misconfigured', () => {
    const classified = classifySessionError(
      businessError(`TeeNova:Payment:${PaymentErrorCodes.ConfigurationInvalid}`),
    )

    expect(classified.message).toContain('choose another payment method')
  })

  it('preserves the existing generic session-failure behaviour', () => {
    const classified = classifySessionError(new Error('Provider unavailable'))

    expect(classified.kind).toBe('generic')
    expect(classified.message).toBe('Provider unavailable')
  })

  it('falls back to the supplied copy when the error carries no message', () => {
    const classified = classifySessionError({}, 'fallback copy')

    expect(classified.kind).toBe('generic')
    expect(classified.message).toBe('fallback copy')
  })
})

describe('classifyQuoteError', () => {
  it('uses one safe generic line for unknown failures', () => {
    const classified = classifyQuoteError(new Error('TypeError: fetch failed at line 42'))

    expect(classified.kind).toBe('generic')
    expect(classified.message).toBe(
      'We couldn’t calculate the current card payment total. Please try again or choose another payment method.',
    )
  })

  it('never leaks raw backend text, codes or HTTP internals to the customer', () => {
    const raw = 'System.InvalidOperationException at StripeOnlinePaymentProvider sk_test_51xyz'
    const classified = classifyQuoteError(new ApiError(500, raw, { error: { message: raw } }))

    expect(classified.message).not.toContain('sk_test')
    expect(classified.message).not.toContain('Exception')
    expect(classified.message).not.toContain('500')
    expect(classified.message).not.toContain('TeeNova:')
  })

  it('keeps known codes available for branching without displaying them', () => {
    const classified = classifyQuoteError(
      businessError(`TeeNova:Payment:${PaymentErrorCodes.CurrencyUnsupported}`),
    )

    expect(classified.code).toBe(PaymentErrorCodes.CurrencyUnsupported)
    expect(classified.message).not.toContain(PaymentErrorCodes.CurrencyUnsupported)
  })
})
