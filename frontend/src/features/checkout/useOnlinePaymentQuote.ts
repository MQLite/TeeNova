'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { classifyQuoteError } from '@/lib/payment-errors'
import type { OnlinePaymentQuote } from '@/types'
import {
  initialOnlinePaymentQuoteState,
  onlinePaymentQuoteReducer,
  type OnlinePaymentQuoteState,
} from './online-payment-quote-state'

interface Options {
  /**
   * Whether a quote is currently wanted (Stripe selected, cart/order payable, …). Flipping this to false
   * resets the state immediately, discarding any in-flight response.
   */
  enabled: boolean
  /**
   * Dependency fingerprint of everything that can change the quoted amount: provider, delivery method,
   * cart contents/quantities, order id, order payment state. A change refetches and, until the new
   * response lands, leaves no usable fingerprint behind.
   */
  signature: string
  fetchQuote: () => Promise<OnlinePaymentQuote>
  /** Batches rapid dependency churn (e.g. +/- quantity clicks). */
  debounceMs?: number
}

interface Result {
  state: OnlinePaymentQuoteState
  /** Refetch the current signature — used after a quote-required/stale rejection. */
  refresh: () => void
}

/**
 * Fetches and owns the server-authoritative online payment quote.
 *
 * Every response is tagged with the generation and signature it was issued under, and the pure reducer
 * discards anything that is no longer current — so a slow request A can never overwrite a newer request B,
 * and a quote that resolves after the customer switched away from Stripe is dropped.
 */
export function useOnlinePaymentQuote({
  enabled,
  signature,
  fetchQuote,
  debounceMs = 250,
}: Options): Result {
  const [state, dispatch] = useReducer(onlinePaymentQuoteReducer, initialOnlinePaymentQuoteState)
  const [refreshToken, setRefreshToken] = useState(0)

  // The fetcher closes over render-scoped values and changes identity every render; keep it in a ref so
  // it never re-triggers the effect. Only `enabled`, `signature` and an explicit refresh do that.
  const fetchQuoteRef = useRef(fetchQuote)
  fetchQuoteRef.current = fetchQuote

  // Mirrors the reducer's generation so the async callback can tag its result without depending on state.
  const generationRef = useRef(0)

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    if (!enabled) {
      generationRef.current += 1
      dispatch({ type: 'reset' })
      return
    }

    generationRef.current += 1
    const generation = generationRef.current
    dispatch({ type: 'request', signature })

    const timer = setTimeout(() => {
      // Re-check identity at send time: a newer request may already have superseded this one.
      if (generation !== generationRef.current) return

      fetchQuoteRef
        .current()
        .then((quote) => {
          dispatch({ type: 'resolved', generation, signature, quote })
        })
        .catch((err: unknown) => {
          const classified = classifyQuoteError(err)
          dispatch({
            type: 'failed',
            generation,
            signature,
            code: classified.code,
            kind: classified.kind,
            message: classified.message,
          })
        })
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [enabled, signature, refreshToken, debounceMs])

  return { state, refresh }
}
