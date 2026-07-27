import type { OnlinePaymentQuote } from '@/types'
import type { PaymentErrorKind } from '@/lib/payment-errors'

/**
 * Pure state model for a server-authoritative online payment quote (Stripe surcharge, Phase 4).
 *
 * The frontend is never a monetary authority: it only holds whatever the backend last returned, plus
 * enough request identity to guarantee a late response can never resurrect a stale amount or fingerprint.
 *
 * Race protection has two parts:
 *  - `generation` — a monotonically increasing id issued on every `request` and every `reset`. A resolved
 *    or failed action from an older generation is discarded.
 *  - `signature` — a dependency fingerprint (provider, delivery method, cart contents, order state, …).
 *    A response whose signature no longer matches the current one is discarded even if the generation
 *    happens to line up.
 *
 * Both `request` and `reset` clear the quote immediately, so the usable fingerprint disappears the moment
 * a pricing dependency changes — before any new response arrives.
 */
export type OnlinePaymentQuoteStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface OnlinePaymentQuoteState {
  status: OnlinePaymentQuoteStatus
  /** Identity of the most recently issued request. Responses from older generations are ignored. */
  generation: number
  /** Dependency signature of the most recently issued request, or null while idle. */
  signature: string | null
  /** Only ever set from a response that matched the current generation AND signature. */
  quote: OnlinePaymentQuote | null
  errorCode: string | null
  errorKind: PaymentErrorKind | null
  errorMessage: string | null
}

export const initialOnlinePaymentQuoteState: OnlinePaymentQuoteState = {
  status: 'idle',
  generation: 0,
  signature: null,
  quote: null,
  errorCode: null,
  errorKind: null,
  errorMessage: null,
}

export type OnlinePaymentQuoteAction =
  /** A quote is no longer wanted (switched away from Stripe, cart emptied, panel ineligible). */
  | { type: 'reset' }
  /** Begin a new request for `signature`; invalidates anything in flight and clears the fingerprint. */
  | { type: 'request'; signature: string }
  | { type: 'resolved'; generation: number; signature: string; quote: OnlinePaymentQuote }
  | {
      type: 'failed'
      generation: number
      signature: string
      code: string | null
      kind: PaymentErrorKind
      message: string
    }

function isCurrent(
  state: OnlinePaymentQuoteState,
  action: { generation: number; signature: string },
): boolean {
  return action.generation === state.generation && action.signature === state.signature
}

export function onlinePaymentQuoteReducer(
  state: OnlinePaymentQuoteState,
  action: OnlinePaymentQuoteAction,
): OnlinePaymentQuoteState {
  switch (action.type) {
    case 'reset':
      // Bump the generation so any in-flight response is discarded on arrival: a quote that completes
      // after the customer switched to manual payment must never reappear.
      return {
        ...initialOnlinePaymentQuoteState,
        generation: state.generation + 1,
      }

    case 'request':
      return {
        status: 'loading',
        generation: state.generation + 1,
        signature: action.signature,
        // Cleared up front — a previous quote is never shown or submitted as though it were current.
        quote: null,
        errorCode: null,
        errorKind: null,
        errorMessage: null,
      }

    case 'resolved':
      if (!isCurrent(state, action)) return state
      return {
        ...state,
        status: 'ready',
        quote: action.quote,
        errorCode: null,
        errorKind: null,
        errorMessage: null,
      }

    case 'failed':
      if (!isCurrent(state, action)) return state
      return {
        ...state,
        status: 'error',
        quote: null,
        errorCode: action.code,
        errorKind: action.kind,
        errorMessage: action.message,
      }

    default:
      return state
  }
}

/**
 * The fingerprint that may be submitted, or null. Available only from a currently displayed, successfully
 * loaded quote — never from a loading, errored, reset or superseded one.
 */
export function usableQuoteFingerprint(state: OnlinePaymentQuoteState): string | null {
  if (state.status !== 'ready' || !state.quote) return null

  const fingerprint = state.quote.quoteFingerprint
  return fingerprint && fingerprint.length > 0 ? fingerprint : null
}

/**
 * True when a Stripe payment must be blocked: the quote is missing, loading or failed. A ready quote with
 * the surcharge disabled is payable with no fingerprint, preserving the pre-surcharge flow.
 */
export function isStripePaymentBlocked(state: OnlinePaymentQuoteState): boolean {
  return state.status !== 'ready' || state.quote == null
}

/** The amount to charge, straight from the backend. Never `baseAmount + surchargeAmount`. */
export function chargedAmountOf(state: OnlinePaymentQuoteState): number | null {
  return state.status === 'ready' && state.quote ? state.quote.chargedAmount : null
}

/** True when the quote actually carries a surcharge worth displaying as its own row. */
export function hasVisibleSurcharge(quote: OnlinePaymentQuote | null | undefined): boolean {
  return Boolean(quote?.surchargeEnabled)
}
