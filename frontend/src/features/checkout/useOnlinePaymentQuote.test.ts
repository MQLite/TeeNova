import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useOnlinePaymentQuote } from './useOnlinePaymentQuote'
import { usableQuoteFingerprint } from './online-payment-quote-state'
import type { OnlinePaymentQuote } from '@/types'

const quote: OnlinePaymentQuote = {
  provider: 'Stripe',
  currency: 'NZD',
  purpose: 'FullPayment',
  baseAmount: 100,
  surchargeEnabled: true,
  surchargeAmount: 3.04,
  chargedAmount: 103.04,
  surchargeDisclosureText: 'A card processing surcharge applies.',
  surchargePercentageBasisPoints: 265,
  surchargeFixedAmount: 0.3,
  calculationVersion: 'stripe-gross-up-v1',
  quoteFingerprint: 'fingerprint-a',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useOnlinePaymentQuote', () => {
  it('fetches once for a stable signature and exposes the ready quote', async () => {
    const fetchQuote = vi.fn().mockResolvedValue(quote)

    const { result } = renderHook(() =>
      useOnlinePaymentQuote({ enabled: true, signature: 'sig-1', fetchQuote, debounceMs: 0 }),
    )

    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(fetchQuote).toHaveBeenCalledTimes(1)
    expect(usableQuoteFingerprint(result.current.state)).toBe('fingerprint-a')
  })

  it('never fetches while disabled and stays idle', async () => {
    const fetchQuote = vi.fn().mockResolvedValue(quote)

    const { result } = renderHook(() =>
      useOnlinePaymentQuote({ enabled: false, signature: 'sig-1', fetchQuote, debounceMs: 0 }),
    )

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fetchQuote).not.toHaveBeenCalled()
    expect(result.current.state.status).toBe('idle')
  })

  it('discards a slow first response once the signature has moved on', async () => {
    const first = deferred<OnlinePaymentQuote>()
    const second = deferred<OnlinePaymentQuote>()
    const fetchQuote = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    const { result, rerender } = renderHook(
      ({ signature }) =>
        useOnlinePaymentQuote({ enabled: true, signature, fetchQuote, debounceMs: 0 }),
      { initialProps: { signature: 'qty-1' } },
    )

    await waitFor(() => expect(fetchQuote).toHaveBeenCalledTimes(1))

    rerender({ signature: 'qty-2' })
    await waitFor(() => expect(fetchQuote).toHaveBeenCalledTimes(2))

    // The newer request lands first, then the stale one.
    second.resolve({ ...quote, chargedAmount: 206.08, quoteFingerprint: 'fingerprint-b' })
    await waitFor(() => expect(result.current.state.status).toBe('ready'))

    first.resolve({ ...quote, chargedAmount: 103.04, quoteFingerprint: 'fingerprint-a' })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(result.current.state.quote?.chargedAmount).toBe(206.08)
    expect(usableQuoteFingerprint(result.current.state)).toBe('fingerprint-b')
  })

  it('drops a quote that resolves after the hook was disabled', async () => {
    const pending = deferred<OnlinePaymentQuote>()
    const fetchQuote = vi.fn().mockReturnValue(pending.promise)

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useOnlinePaymentQuote({ enabled, signature: 'sig-1', fetchQuote, debounceMs: 0 }),
      { initialProps: { enabled: true } },
    )

    await waitFor(() => expect(fetchQuote).toHaveBeenCalledTimes(1))

    rerender({ enabled: false }) // customer switched to manual payment
    pending.resolve(quote)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(result.current.state.status).toBe('idle')
    expect(result.current.state.quote).toBeNull()
    expect(usableQuoteFingerprint(result.current.state)).toBeNull()
  })

  it('clears the fingerprint immediately when a dependency changes, before the new quote lands', async () => {
    const first = deferred<OnlinePaymentQuote>()
    const second = deferred<OnlinePaymentQuote>()
    const fetchQuote = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    const { result, rerender } = renderHook(
      ({ signature }) =>
        useOnlinePaymentQuote({ enabled: true, signature, fetchQuote, debounceMs: 0 }),
      { initialProps: { signature: 'sig-1' } },
    )

    await waitFor(() => expect(fetchQuote).toHaveBeenCalledTimes(1))
    first.resolve(quote)
    await waitFor(() => expect(usableQuoteFingerprint(result.current.state)).toBe('fingerprint-a'))

    rerender({ signature: 'sig-2' })

    expect(usableQuoteFingerprint(result.current.state)).toBeNull()
    expect(result.current.state.status).toBe('loading')

    second.resolve({ ...quote, quoteFingerprint: 'fingerprint-b' })
    await waitFor(() => expect(usableQuoteFingerprint(result.current.state)).toBe('fingerprint-b'))
  })

  it('refresh() refetches the same signature', async () => {
    const fetchQuote = vi.fn().mockResolvedValue(quote)

    const { result } = renderHook(() =>
      useOnlinePaymentQuote({ enabled: true, signature: 'sig-1', fetchQuote, debounceMs: 0 }),
    )

    await waitFor(() => expect(fetchQuote).toHaveBeenCalledTimes(1))

    result.current.refresh()

    await waitFor(() => expect(fetchQuote).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
  })

  it('classifies a failure into safe customer copy', async () => {
    const fetchQuote = vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:5100'))

    const { result } = renderHook(() =>
      useOnlinePaymentQuote({ enabled: true, signature: 'sig-1', fetchQuote, debounceMs: 0 }),
    )

    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state.errorMessage).toBe(
      'We couldn’t calculate the current card payment total. Please try again or choose another payment method.',
    )
    expect(result.current.state.errorMessage).not.toContain('ECONNREFUSED')
  })

  it('debounces rapid dependency churn into a single request', async () => {
    const fetchQuote = vi.fn().mockResolvedValue(quote)

    const { rerender } = renderHook(
      ({ signature }) =>
        useOnlinePaymentQuote({ enabled: true, signature, fetchQuote, debounceMs: 50 }),
      { initialProps: { signature: 'qty-1' } },
    )

    rerender({ signature: 'qty-2' })
    rerender({ signature: 'qty-3' })
    rerender({ signature: 'qty-4' })

    await waitFor(() => expect(fetchQuote).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(fetchQuote).toHaveBeenCalledTimes(1)
  })
})
