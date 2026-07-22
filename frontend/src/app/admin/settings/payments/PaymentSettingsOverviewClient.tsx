'use client'

// Payment Settings — Overview (Jira 9908.1).
//
// Read-only landing page for the four-route Payment Settings area. Loads the masked overview once and
// renders: sub-navigation, the authoritative active-runtime-mode banner, a Viewer notice, and three
// summary cards (Test / Live / Runtime). It contains NO credential inputs and NO mutation controls
// (no Save/Disable/Validate/activation) — all writes live on the dedicated Test/Live pages.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { makePaymentSettingsApi } from '@/api/payment-settings'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import type { PaymentSettingsOverview } from '@/types'
import { PaymentSettingsNavigation } from './components/PaymentSettingsNavigation'
import { ActiveRuntimeModeBanner } from './components/ActiveRuntimeModeBanner'
import { PaymentModeStatusCard } from './components/PaymentModeStatusCard'

const paymentSettingsApi = makePaymentSettingsApi(adminApiClient)

export default function PaymentSettingsOverviewClient({ role }: { role?: string }) {
  const [overview, setOverview] = useState<PaymentSettingsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canWrite = role === 'Admin'

  useEffect(() => {
    let active = true
    paymentSettingsApi.getOverview()
      .then((data) => { if (active) setOverview(data) })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
        // Never echo any submitted secret — there are none on this read-only page.
        if (active) setError('Failed to load payment settings.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <div className="admin-page admin-stack">
      <AdminPageHeader
        title="Payment Settings"
        subtitle="Overview of Stripe Test, Live, and runtime configuration. Secrets are encrypted at rest and never displayed."
      />

      <div className="max-w-4xl space-y-6">
        <PaymentSettingsNavigation />

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-black/[0.04]" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : overview ? (
          <>
            <ActiveRuntimeModeBanner overview={overview} />

            {!canWrite && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M18 10A8 8 0 11.999 10 8 8 0 0118 10zM9 5a1 1 0 112 0v4a1 1 0 11-2 0V5zm1 8a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>
                Read-only access — only an Admin can change payment settings.
              </div>
            )}

            <div className="grid gap-5 md:grid-cols-2">
              <PaymentModeStatusCard
                mode="Test"
                setting={overview.test}
                isActive={!overview.activeModeIsLive}
                href="/admin/settings/payments/test"
              />
              <PaymentModeStatusCard
                mode="Live"
                setting={overview.live}
                isActive={overview.activeModeIsLive}
                href="/admin/settings/payments/live"
                unlocked={overview.liveModeConfigurationUnlocked}
              />
            </div>

            {/* Runtime summary card */}
            <div className="rounded-xl border border-black/[0.08] bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.54px] text-black/40">Runtime Mode</p>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${overview.activeModeIsLive ? 'bg-red-100 text-red-700' : 'bg-black/[0.05] text-black/60'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${overview.activeModeIsLive ? 'bg-red-500' : 'bg-black/40'}`} />
                  {overview.activeMode}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-black/70">Active mode</span><span className="font-medium text-black/80">{overview.activeMode}</span></div>
                <div className="flex items-center justify-between"><span className="text-black/70">Active-mode source</span><span className="text-black/60">{overview.activeModeSource}</span></div>
                <div className="flex items-center justify-between"><span className="text-black/70">Public checkout environment</span><span className="text-black/60">{overview.activeMode}</span></div>
                <div className="flex items-center justify-between"><span className="text-black/70">Webhook verification environment</span><span className="text-black/60">{overview.activeMode}</span></div>
                <div className="flex items-center justify-between"><span className="text-black/70">Live configuration unlock</span><span className="text-black/60">{overview.liveModeConfigurationUnlocked ? 'Unlocked' : 'Locked'}</span></div>
              </div>
              <div className="mt-4 border-t border-black/[0.06] pt-3">
                <Link href="/admin/settings/payments/runtime" className="inline-flex items-center gap-1.5 text-sm font-medium text-black/70 transition-colors hover:text-black">
                  View Runtime Mode status
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                </Link>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
