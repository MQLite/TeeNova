// Environment identity badge for Stripe Test vs Live (Jira 9908.1).
//
// Communicates the environment with text + icon (never colour alone) so an operator can never
// mistake a Test surface for a Live one:
//   • Test → "TEST DATA — NO REAL MONEY"
//   • Live → "REAL PAYMENTS"
// This is purely presentational — it takes a mode string and renders a labelled badge.

import type { PaymentProviderMode } from '@/types'

export function PaymentEnvironmentBadge({ mode }: { mode: PaymentProviderMode }) {
  if (mode === 'Live') {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.4px] text-red-700"
        role="status"
      >
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        Live · Real payments
      </span>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.4px] text-blue-700"
      role="status"
    >
      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
      Test data · No real money
    </span>
  )
}
