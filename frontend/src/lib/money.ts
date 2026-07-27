/**
 * Currency display for the online payment surcharge flow (Phase 4).
 *
 * Kept separate from the storefront's plain `$` subtotals on purpose: the payment panel shows what the
 * card provider will charge, so it is prefixed explicitly (NZ$103.04) to distinguish it from the
 * commercial order total. Within a single panel the prefix never varies.
 *
 * Surcharge v1 is NZD-only, so anything else falls back to a `CODE 0.00` form rather than silently
 * mislabelling a foreign amount as NZ dollars.
 */
export function formatPaymentAmount(value: number, currency = 'NZD'): string {
  const amount = Number.isFinite(value) ? value : 0
  const normalized = (currency || 'NZD').trim().toUpperCase()

  if (normalized === 'NZD') return `NZ$${amount.toFixed(2)}`

  return `${normalized} ${amount.toFixed(2)}`
}
