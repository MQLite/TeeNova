import { describe, expect, it } from 'vitest'
import type { OnlinePaymentQuote } from '@/types'
import {
  chargedAmountOf,
  initialOnlinePaymentQuoteState,
  isStripePaymentBlocked,
  onlinePaymentQuoteReducer,
  usableQuoteFingerprint,
  type OnlinePaymentQuoteState,
} from './online-payment-quote-state'

const canonicalQuote: OnlinePaymentQuote = {
  provider: 'Stripe',
  currency: 'NZD',
  purpose: 'FullPayment',
  baseAmount: 100,
  surchargeEnabled: true,
  surchargeAmount: 3.04,
  chargedAmount: 103.04,
  surchargeDisclosureText: 'A card processing surcharge applies to online card payments.',
  surchargePercentageBasisPoints: 265,
  surchargeFixedAmount: 0.3,
  calculationVersion: 'stripe-gross-up-v1',
  quoteFingerprint: 'fingerprint-a',
}

function quoteWith(overrides: Partial<OnlinePaymentQuote>): OnlinePaymentQuote {
  return { ...canonicalQuote, ...overrides }
}

/** Drives the reducer through a request that resolves successfully. */
function ready(signature = 'sig-1', quote = canonicalQuote): OnlinePaymentQuoteState {
  const requested = onlinePaymentQuoteReducer(initialOnlinePaymentQuoteState, {
    type: 'request',
    signature,
  })
  return onlinePaymentQuoteReducer(requested, {
    type: 'resolved',
    generation: requested.generation,
    signature,
    quote,
  })
}

describe('onlinePaymentQuoteReducer', () => {
  it('starts idle with no quote and no fingerprint', () => {
    expect(initialOnlinePaymentQuoteState.status).toBe('idle')
    expect(initialOnlinePaymentQuoteState.quote).toBeNull()
    expect(usableQuoteFingerprint(initialOnlinePaymentQuoteState)).toBeNull()
  })

  it('clears the previous quote and fingerprint the moment a new request starts', () => {
    const loaded = ready()
    expect(usableQuoteFingerprint(loaded)).toBe('fingerprint-a')

    const refetching = onlinePaymentQuoteReducer(loaded, { type: 'request', signature: 'sig-2' })

    expect(refetching.status).toBe('loading')
    expect(refetching.quote).toBeNull()
    expect(usableQuoteFingerprint(refetching)).toBeNull()
    expect(isStripePaymentBlocked(refetching)).toBe(true)
  })

  it('stores a resolved quote that matches the current generation and signature', () => {
    const state = ready()

    expect(state.status).toBe('ready')
    expect(state.quote).toEqual(canonicalQuote)
    expect(chargedAmountOf(state)).toBe(103.04)
    expect(isStripePaymentBlocked(state)).toBe(false)
  })

  it('records a failure with its safe message and blocks payment', () => {
    const requested = onlinePaymentQuoteReducer(initialOnlinePaymentQuoteState, {
      type: 'request',
      signature: 'sig-1',
    })

    const failed = onlinePaymentQuoteReducer(requested, {
      type: 'failed',
      generation: requested.generation,
      signature: 'sig-1',
      code: 'StripeSurchargeConfigurationInvalid',
      kind: 'blocked',
      message: 'Card payments are temporarily unavailable.',
    })

    expect(failed.status).toBe('error')
    expect(failed.quote).toBeNull()
    expect(failed.errorCode).toBe('StripeSurchargeConfigurationInvalid')
    expect(failed.errorKind).toBe('blocked')
    expect(usableQuoteFingerprint(failed)).toBeNull()
    expect(isStripePaymentBlocked(failed)).toBe(true)
  })

  // ── Race and stale-response protection ──────────────────────────────────────

  it('ignores a slow request A that resolves after a newer request B', () => {
    // A starts…
    const requestA = onlinePaymentQuoteReducer(initialOnlinePaymentQuoteState, {
      type: 'request',
      signature: 'qty-1',
    })
    // …the customer changes quantity, so B starts…
    const requestB = onlinePaymentQuoteReducer(requestA, { type: 'request', signature: 'qty-2' })
    // …B completes first…
    const afterB = onlinePaymentQuoteReducer(requestB, {
      type: 'resolved',
      generation: requestB.generation,
      signature: 'qty-2',
      quote: quoteWith({ chargedAmount: 206.08, quoteFingerprint: 'fingerprint-b' }),
    })
    // …then the stale A finally arrives.
    const afterLateA = onlinePaymentQuoteReducer(afterB, {
      type: 'resolved',
      generation: requestA.generation,
      signature: 'qty-1',
      quote: quoteWith({ chargedAmount: 103.04, quoteFingerprint: 'fingerprint-a' }),
    })

    expect(afterLateA).toBe(afterB)
    expect(chargedAmountOf(afterLateA)).toBe(206.08)
    expect(usableQuoteFingerprint(afterLateA)).toBe('fingerprint-b')
  })

  it('ignores a quote that resolves after the customer switched away from Stripe', () => {
    const requested = onlinePaymentQuoteReducer(initialOnlinePaymentQuoteState, {
      type: 'request',
      signature: 'stripe',
    })
    const switchedToManual = onlinePaymentQuoteReducer(requested, { type: 'reset' })

    const late = onlinePaymentQuoteReducer(switchedToManual, {
      type: 'resolved',
      generation: requested.generation,
      signature: 'stripe',
      quote: canonicalQuote,
    })

    expect(late.status).toBe('idle')
    expect(late.quote).toBeNull()
    expect(usableQuoteFingerprint(late)).toBeNull()
  })

  it('ignores a late failure from a superseded request', () => {
    const requestA = onlinePaymentQuoteReducer(initialOnlinePaymentQuoteState, {
      type: 'request',
      signature: 'sig-1',
    })
    const requestB = onlinePaymentQuoteReducer(requestA, { type: 'request', signature: 'sig-2' })
    const afterB = onlinePaymentQuoteReducer(requestB, {
      type: 'resolved',
      generation: requestB.generation,
      signature: 'sig-2',
      quote: canonicalQuote,
    })

    const lateFailure = onlinePaymentQuoteReducer(afterB, {
      type: 'failed',
      generation: requestA.generation,
      signature: 'sig-1',
      code: null,
      kind: 'generic',
      message: 'stale failure',
    })

    expect(lateFailure).toBe(afterB)
    expect(lateFailure.status).toBe('ready')
  })

  it('ignores a response whose signature no longer matches even at the same generation', () => {
    const requested = onlinePaymentQuoteReducer(initialOnlinePaymentQuoteState, {
      type: 'request',
      signature: 'delivery-pickup',
    })

    const mismatched = onlinePaymentQuoteReducer(requested, {
      type: 'resolved',
      generation: requested.generation,
      signature: 'delivery-shipping',
      quote: canonicalQuote,
    })

    expect(mismatched).toBe(requested)
    expect(mismatched.status).toBe('loading')
  })

  it('bumps the generation on reset so nothing in flight can be applied later', () => {
    const requested = onlinePaymentQuoteReducer(initialOnlinePaymentQuoteState, {
      type: 'request',
      signature: 'sig-1',
    })
    const reset = onlinePaymentQuoteReducer(requested, { type: 'reset' })

    expect(reset.generation).toBeGreaterThan(requested.generation)
    expect(reset.signature).toBeNull()
  })

  it('an order refresh (new signature) invalidates the previous fingerprint immediately', () => {
    const beforeRefresh = ready('order:balance-200')
    expect(usableQuoteFingerprint(beforeRefresh)).toBe('fingerprint-a')

    const afterRefresh = onlinePaymentQuoteReducer(beforeRefresh, {
      type: 'request',
      signature: 'order:balance-100',
    })

    expect(usableQuoteFingerprint(afterRefresh)).toBeNull()
    expect(isStripePaymentBlocked(afterRefresh)).toBe(true)
  })
})

describe('usableQuoteFingerprint', () => {
  it('is null for a disabled-surcharge quote that carries no fingerprint', () => {
    const state = ready('sig', quoteWith({
      surchargeEnabled: false,
      surchargeAmount: 0,
      chargedAmount: 100,
      quoteFingerprint: '',
    }))

    expect(usableQuoteFingerprint(state)).toBeNull()
    // …but payment is NOT blocked: the pre-surcharge flow needs no fingerprint.
    expect(isStripePaymentBlocked(state)).toBe(false)
  })

  it('is null when the backend returns a null fingerprint', () => {
    const state = ready('sig', quoteWith({ quoteFingerprint: null }))
    expect(usableQuoteFingerprint(state)).toBeNull()
  })
})

describe('chargedAmountOf', () => {
  it('returns the backend charged amount rather than base + surcharge', () => {
    const state = ready('sig', quoteWith({ baseAmount: 100, surchargeAmount: 3.04, chargedAmount: 103.04 }))

    expect(chargedAmountOf(state)).toBe(103.04)
    expect(chargedAmountOf(state)).toBe(state.quote!.chargedAmount)
  })

  it('is null unless a quote is ready', () => {
    expect(chargedAmountOf(initialOnlinePaymentQuoteState)).toBeNull()
  })
})
