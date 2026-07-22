'use client'

// Payment Settings — Runtime Mode status (Jira 9908.1).
//
// READ-ONLY for every role. It renders no secret inputs, no mutation controls, no server-config editor,
// and no ActiveMode toggle — the active runtime mode is chosen by approved server configuration
// (OnlinePayments:ActiveMode) and cannot be changed here.
//
// Fail-closed messaging (audit §5 / ticket "Critical Runtime Safety Rule") is delegated to
// ActiveRuntimeModeBanner: when ActiveMode=Live but the Live row is not ready, the page states that the
// Live runtime configuration is invalid and checkout is blocked — it NEVER claims an automatic fall
// back to Test.

import { useEffect, useState } from 'react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { makePaymentSettingsApi } from '@/api/payment-settings'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import type { PaymentSettingsOverview } from '@/types'
import { PaymentSettingsNavigation } from '../components/PaymentSettingsNavigation'
import { ActiveRuntimeModeBanner } from '../components/ActiveRuntimeModeBanner'

const paymentSettingsApi = makePaymentSettingsApi(adminApiClient)

const sectionCls = 'mb-1.5 text-[11px] font-semibold uppercase tracking-[0.54px] text-black/40'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-black/70">{label}</span>
      <span className="text-right text-sm text-black/80">{value}</span>
    </div>
  )
}

function ReadyPill({ ready }: { ready: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${ready ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-green-500' : 'bg-amber-500'}`} />
      {ready ? 'Ready' : 'Not ready'}
    </span>
  )
}

export default function RuntimeModeStatusClient({ role }: { role?: string }) {
  const [overview, setOverview] = useState<PaymentSettingsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Role is accepted for layout/auth consistency; the page is read-only regardless of role.
  void role

  useEffect(() => {
    let active = true
    paymentSettingsApi.getOverview()
      .then((data) => { if (active) setOverview(data) })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
        if (active) setError('Failed to load runtime status.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <div className="admin-page admin-stack">
      <AdminPageHeader
        title="Runtime Mode"
        subtitle="Read-only view of the mode public checkout and webhook verification resolve at runtime."
      />

      <div className="max-w-2xl space-y-6">
        <PaymentSettingsNavigation />

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-black/[0.04]" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : overview ? (
          <>
            <ActiveRuntimeModeBanner overview={overview} />

            {/* Authoritative runtime resolution */}
            <div>
              <p className={sectionCls}>Active Runtime Resolution</p>
              <div className="rounded-xl border border-black/[0.08] bg-white p-5">
                <Row label="Active mode" value={<strong className={overview.activeModeIsLive ? 'text-red-700' : 'text-black/80'}>{overview.activeMode}</strong>} />
                <Row label="Active mode is Live" value={overview.activeModeIsLive ? 'Yes' : 'No'} />
                <Row label="Active-mode source" value={overview.activeModeSource} />
                <Row label="Public checkout environment" value={overview.activeMode} />
                <Row label="Webhook verification environment" value={overview.activeMode} />
                <Row label="Live configuration unlock" value={overview.liveModeConfigurationUnlocked ? 'Unlocked' : 'Locked'} />
                <Row label="Active-mode ready for checkout" value={<ReadyPill ready={overview.activeModeIsLive ? overview.live.canCreateCheckoutSession : overview.test.canCreateCheckoutSession} />} />
                {(() => {
                  const activeSetting = overview.activeModeIsLive ? overview.live : overview.test
                  return activeSetting.missingPrerequisites.length > 0 ? (
                    <Row label="Missing prerequisites (active mode)" value={<span className="font-mono text-xs text-amber-700">{activeSetting.missingPrerequisites.join(', ')}</span>} />
                  ) : null
                })()}
              </div>
            </div>

            {/* Per-mode configuration snapshot (masked, read-only) */}
            <div>
              <p className={sectionCls}>Configuration Snapshot</p>
              <div className="rounded-xl border border-black/[0.08] bg-white p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-medium text-black/80">Test mode {!overview.activeModeIsLive && <span className="text-green-700">· active</span>}</p>
                    <Row label="Configured" value={overview.test.isConfigured ? 'Yes' : 'No'} />
                    <Row label="Enabled" value={overview.test.isEnabled ? 'Yes' : 'No'} />
                    <Row label="Ready" value={<ReadyPill ready={overview.test.canCreateCheckoutSession} />} />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-black/80">Live mode {overview.activeModeIsLive && <span className="text-red-700">· active</span>}</p>
                    <Row label="Unlocked" value={overview.liveModeConfigurationUnlocked ? 'Yes' : 'No'} />
                    <Row label="Configured" value={overview.live.isConfigured ? 'Yes' : 'No'} />
                    <Row label="Enabled" value={overview.live.isEnabled ? 'Yes' : 'No'} />
                    <Row label="Ready" value={<ReadyPill ready={overview.live.canCreateCheckoutSession} />} />
                  </div>
                </div>
              </div>
            </div>

            {/* Environment / infrastructure signals */}
            <div>
              <p className={sectionCls}>Environment</p>
              <div className="rounded-xl border border-black/[0.08] bg-white p-5">
                <Row label="Encryption passphrase configured" value={overview.test.encryptionPassphraseConfigured ? 'Yes' : 'No (dev default in use)'} />
                <Row label="Webhook endpoint URL" value={<span className="font-mono text-xs text-black/60">{overview.test.webhookEndpointUrl || overview.test.webhookEndpointPath}</span>} />
                <Row label="Stripe secrets runtime source" value={overview.test.secretsRuntimeSource} />
                <Row label="Config runtime source" value={overview.test.configRuntimeSource} />
              </div>
              <p className="mt-2 px-1 text-xs text-black/45">
                The active mode and unlock flag come from server configuration. Changing them requires an
                approved server configuration change and an API restart/reload — they cannot be modified from
                this page.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
