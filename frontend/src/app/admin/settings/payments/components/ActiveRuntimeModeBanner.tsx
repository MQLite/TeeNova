// Authoritative active-runtime-mode banner (Jira 9908.1).
//
// Displays the mode public checkout and webhook verification actually resolve at runtime, straight
// from the server-config-derived overview fields (`activeMode`, `activeModeIsLive`,
// `activeModeSource`). This is READ-ONLY — the active mode is chosen by approved server config
// (OnlinePayments:ActiveMode) and cannot be changed from the UI.
//
// Critical fail-closed rule (audit §5 / ticket "Critical Runtime Safety Rule"):
//   • ActiveMode=Test (unlock off or ActiveMode≠Live) → Test is authoritative; no real money.
//   • ActiveMode=Live AND the Live row is ready → real payments are active.
//   • ActiveMode=Live BUT the Live row is missing/disabled/not ready → Live REMAINS the active mode,
//     checkout is BLOCKED, and the copy must NOT imply an automatic fall back to Test.

import type { PaymentSettingsOverview } from '@/types'

export function ActiveRuntimeModeBanner({ overview }: { overview: PaymentSettingsOverview }) {
  const isLive = overview.activeModeIsLive
  // "Ready" = the active mode's persisted row can actually create a checkout session
  // (enabled + both secrets + valid return URLs). Derived by the backend; never recomputed here.
  const liveReady = overview.live.canCreateCheckoutSession
  const liveInvalid = isLive && !liveReady

  if (liveInvalid) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-300 bg-red-50 px-4 py-3.5 text-sm text-red-800"
      >
        <div className="flex items-start gap-2.5">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="font-semibold">Live runtime configuration is invalid.</p>
            <p className="mt-0.5 text-red-700/90">
              Checkout is blocked until the Live configuration is corrected. The active runtime mode
              remains <strong>Live</strong> (source: {overview.activeModeSource}); the system does not
              serve Test payments in its place.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (isLive) {
    return (
      <div
        role="status"
        className="rounded-xl border border-red-300 bg-red-50 px-4 py-3.5 text-sm text-red-800"
      >
        <div className="flex items-start gap-2.5">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="font-semibold uppercase tracking-[0.4px]">Current runtime mode: Live</p>
            <p className="mt-0.5 text-red-700/90">
              <strong>REAL PAYMENTS ARE ACTIVE.</strong> Public checkout resolves Live-mode Stripe
              configuration (source: {overview.activeModeSource}).
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      role="status"
      className="rounded-xl border border-black/[0.08] bg-black/[0.02] px-4 py-3.5 text-sm text-black/70"
    >
      <div className="flex items-start gap-2.5">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <div>
          <p className="font-semibold uppercase tracking-[0.4px] text-black/80">Current runtime mode: Test</p>
          <p className="mt-0.5 text-black/55">
            Public checkout uses Stripe Test configuration (source: {overview.activeModeSource}). No
            real money is collected.
          </p>
        </div>
      </div>
    </div>
  )
}
