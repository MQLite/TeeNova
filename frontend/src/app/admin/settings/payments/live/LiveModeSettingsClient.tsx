'use client'

// Payment Settings — Stripe Live Mode (Jira 9908.1).
//
// Owns ALL Live-mode status + mutation state, and nothing else: it never imports or renders any Test
// form component, and it exposes no control that could change the runtime ActiveMode (there is no such
// endpoint). Saving Live credentials does NOT route public checkout to Live — that is a separate,
// approved server-side switch (OnlinePayments:ActiveMode), stated prominently in the form.
//
// Guards (mirroring the doubly-guarded backend):
//   • When `liveModeConfigurationUnlocked` is false → render a LOCKED card with NO secret inputs, NO
//     confirmation-phrase input, and NO Save. There is no UI bypass; the API also rejects Live writes.
//   • When unlocked → the guarded write form requires the exact phrase "ENABLE LIVE MODE" before Save
//     is enabled, and only accepts live keys (backend re-validates prefixes/restricted keys).
//
// Secret lifecycle: live secret inputs + the confirmation phrase are write-only — they start empty, are
// never populated from server data, and are cleared after a save (success OR failure). Nothing is
// placed in shared context, a global store, browser storage, a URL, or a log line; leaving the route
// unmounts the component and discards all unsubmitted secret state.

import { useEffect, useState } from 'react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { makePaymentSettingsApi } from '@/api/payment-settings'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import type { PaymentSettingsOverview } from '@/types'
import { PaymentSettingsNavigation } from '../components/PaymentSettingsNavigation'
import { PaymentEnvironmentBadge } from '../components/PaymentEnvironmentBadge'
import { SecretConfiguredStatus } from '../components/SecretConfiguredStatus'
import { ActiveRuntimeModeBanner } from '../components/ActiveRuntimeModeBanner'

const paymentSettingsApi = makePaymentSettingsApi(adminApiClient)

const inputCls   = 'w-full rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:border-black/30 focus:outline-none disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-black/40'
const labelCls   = 'block mb-1.5 text-sm text-black/70'
const hintCls    = 'mt-1 text-xs text-black/40'
const sectionCls = 'mb-1.5 text-[11px] font-semibold uppercase tracking-[0.54px] text-black/40'

type Tone = 'success' | 'error'

export default function LiveModeSettingsClient({ role }: { role?: string }) {
  const [overview, setOverview] = useState<PaymentSettingsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [toastTone, setToastTone] = useState<Tone>('success')

  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)

  // Write-only secret inputs — never populated from the server, cleared after save.
  const [secretKey, setSecretKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')

  // Editable non-secret fields.
  const [isEnabled, setIsEnabled] = useState(false)
  const [publishableKey, setPublishableKey] = useState('')
  const [successUrl, setSuccessUrl] = useState('')
  const [cancelUrl, setCancelUrl] = useState('')

  // Deliberate-intent confirmation gate.
  const [phrase, setPhrase] = useState('')

  const canWrite = role === 'Admin'

  function showToast(msg: string, tone: Tone = 'success') {
    setToast(msg)
    setToastTone(tone)
    setTimeout(() => setToast(null), 4000)
  }

  // Hydrate non-secret editable fields from the masked Live DTO. Secrets are never returned.
  function hydrate(data: PaymentSettingsOverview) {
    setOverview(data)
    setIsEnabled(data.live.isEnabled)
    setPublishableKey(data.live.publishableKey ?? '')
    setSuccessUrl(data.live.successReturnBaseUrl ?? '')
    setCancelUrl(data.live.cancelReturnBaseUrl ?? '')
    setSecretKey('')
    setWebhookSecret('')
  }

  function load() {
    return paymentSettingsApi.getOverview().then(hydrate)
  }

  useEffect(() => {
    load()
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
        setLoadError('Failed to load Live settings.')
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const unlocked = overview?.liveModeConfigurationUnlocked ?? false
  const live = overview?.live
  const requiredPhrase = overview?.liveConfirmationPhrase || 'ENABLE LIVE MODE'
  const phraseOk = phrase.trim() === requiredPhrase

  async function handleSave() {
    if (!canWrite || !phraseOk) return
    setSaving(true)
    try {
      await paymentSettingsApi.updateStripeLive({
        confirmationPhrase: phrase.trim(),
        isEnabled,
        currency: 'NZD',
        publishableKey: publishableKey.trim() || null,
        secretKey: secretKey.trim() || undefined,
        webhookSecret: webhookSecret.trim() || undefined,
        successReturnBaseUrl: successUrl.trim() || null,
        cancelReturnBaseUrl: cancelUrl.trim() || null,
      })
      setSecretKey('')
      setWebhookSecret('')
      setPhrase('')
      await load().catch(() => { /* non-fatal: status will refresh on next load */ })
      showToast('Stripe Live settings saved.')
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
      // Never surface the submitted secret — clear the write-only inputs (and phrase) on error too.
      setSecretKey('')
      setWebhookSecret('')
      setPhrase('')
      showToast(err instanceof Error ? err.message : 'Failed to save live settings.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDisable() {
    if (!canWrite) return
    setBusy(true)
    setConfirmDisable(false)
    try {
      await paymentSettingsApi.disableStripeLive()
      setIsEnabled(false)
      await load().catch(() => { /* non-fatal */ })
      showToast('Stripe Live mode disabled.')
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
      showToast(err instanceof Error ? err.message : 'Failed to disable.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <>
      <AdminPageHeader
        title="Stripe Live Mode"
        subtitle="Real payments. Live keys are encrypted at rest and never displayed after saving."
      />
      <div className="max-w-2xl space-y-6">
        <PaymentSettingsNavigation />
        <div className="flex flex-wrap items-center gap-3">
          <PaymentEnvironmentBadge mode="Live" />
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${overview?.activeModeIsLive ? 'bg-red-100 text-red-700' : 'bg-black/[0.05] text-black/50'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${overview?.activeModeIsLive ? 'bg-red-500' : 'bg-black/30'}`} />
            {overview?.activeModeIsLive ? 'Active runtime mode' : 'Inactive runtime mode'}
          </span>
        </div>
      </div>
    </>
  )

  if (loading) {
    return (
      <div className="admin-page admin-stack">
        <AdminPageHeader title="Stripe Live Mode" subtitle="Real payments." />
        <div className="max-w-2xl space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-black/[0.04]" />
          ))}
        </div>
      </div>
    )
  }

  if (loadError || !overview || !live) {
    return (
      <div className="admin-page admin-stack">
        {header}
        <div className="max-w-2xl">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError ?? 'Failed to load Live settings.'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page admin-stack">
      {header}
      <div className="max-w-2xl space-y-6">
        {/* Read-only runtime context — reinforces that Live config ≠ Live active. */}
        <ActiveRuntimeModeBanner overview={overview} />

        {!unlocked ? (
          // ── Locked state — NO secret inputs, NO phrase input, NO Save. Same for Admin and Viewer.
          <div>
            <p className={sectionCls}>Live Mode</p>
            <div className="flex items-start gap-3 rounded-xl border border-black/[0.08] bg-black/[0.02] p-5">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-black/40" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-medium text-black/70">Live configuration is locked.</p>
                <p className="mt-1 text-sm text-black/50">
                  Complete and approve the Jira 9907 checklist before unlocking Live configuration. An operator
                  must set <code className="text-black/70">OnlinePayments:AllowLiveModeConfiguration=true</code>
                  {' '}(via <code className="text-black/70">/etc/teenova/api.env</code> or user-secrets) and restart the API.
                  Until then, live keys (<code className="text-black/70">sk_live_</code>) are rejected on save.
                </p>
                <p className="mt-2 text-xs text-black/40">
                  Unlocking Live configuration does not activate Live checkout — routing public checkout to Live is a
                  separate deliberate switch (<code className="text-black/60">OnlinePayments:ActiveMode=Live</code>).
                </p>
              </div>
            </div>

            {/* Masked prior-Live status (safe read) so operators can see whether a Live row already exists. */}
            <div className="mt-4 space-y-2 rounded-xl border border-black/[0.08] bg-white p-5">
              <p className={sectionCls}>Live Status (read-only)</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-black/70">Live mode</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${live.isEnabled ? 'bg-red-100 text-red-700' : live.isConfigured ? 'bg-amber-50 text-amber-700' : 'bg-black/[0.05] text-black/50'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${live.isEnabled ? 'bg-red-500' : live.isConfigured ? 'bg-amber-500' : 'bg-black/30'}`} />
                  {live.isEnabled ? 'Enabled' : live.isConfigured ? 'Configured · disabled' : 'Not configured'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-black/70">Live secret key</span>
                <SecretConfiguredStatus configured={live.secretKeyConfigured} last4={live.secretKeyLast4} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-black/70">Live webhook secret</span>
                <SecretConfiguredStatus configured={live.webhookSecretConfigured} last4={live.webhookSecretLast4} />
              </div>
            </div>
          </div>
        ) : (
          // ── Unlocked state ──────────────────────────────────────────────────────
          <div>
            <p className={sectionCls}>Live Mode</p>
            <div className="space-y-4 rounded-xl border border-red-200 bg-red-50/40 p-5">

              {/* Strong warning */}
              <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                <div className="text-sm text-red-800">
                  <p className="font-semibold">Live mode handles real money.</p>
                  <p className="mt-0.5 text-red-700/90">
                    Only enter Stripe <strong>live</strong> keys (<code>sk_live_</code> / <code>whsec_</code>, optional
                    {' '}<code>pk_live_</code>) obtained from the Stripe Dashboard in Live mode. Live keys are encrypted at
                    rest and never displayed again.
                  </p>
                </div>
              </div>

              {/* Configured ≠ active reminder (required wording). */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p className="font-medium">Saving Live credentials does not activate public Live checkout.</p>
                <p className="mt-0.5 text-amber-700/90">
                  Runtime mode is controlled separately through approved server configuration
                  (<code>OnlinePayments:ActiveMode</code>). Saving here only stores/updates the encrypted Live row.
                </p>
              </div>

              {/* Checklist reminder */}
              <p className="text-xs text-black/50">
                Reminder: only proceed once the Jira 9907 checklist is approved, a live Stripe webhook is registered,
                monitoring is staffed, and rollback is understood.
              </p>

              {/* Live status */}
              <div className="space-y-2 rounded-lg border border-black/[0.08] bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-black/70">Live mode</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${live.isEnabled ? 'bg-red-100 text-red-700' : live.isConfigured ? 'bg-amber-50 text-amber-700' : 'bg-black/[0.05] text-black/50'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${live.isEnabled ? 'bg-red-500' : live.isConfigured ? 'bg-amber-500' : 'bg-black/30'}`} />
                    {live.isEnabled ? 'Enabled' : live.isConfigured ? 'Configured · disabled' : 'Not configured'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-black/70">Ready for checkout</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${live.canCreateCheckoutSession ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${live.canCreateCheckoutSession ? 'bg-green-500' : 'bg-amber-500'}`} />
                    {live.canCreateCheckoutSession ? 'Ready' : 'Not ready'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-black/70">Live secret key</span>
                  <SecretConfiguredStatus configured={live.secretKeyConfigured} last4={live.secretKeyLast4} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-black/70">Live webhook secret</span>
                  <SecretConfiguredStatus configured={live.webhookSecretConfigured} last4={live.webhookSecretLast4} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-black/70">Live publishable key</span>
                  {live.publishableKey
                    ? <span className="font-mono text-xs text-black/60">pk_live_••••{live.publishableKey.slice(-4)}</span>
                    : <span className="text-xs text-black/40">optional · not set</span>}
                </div>
              </div>

              {!canWrite && (
                <p className="text-xs text-black/40">Read-only — only an Admin can change Live settings.</p>
              )}

              {canWrite && (
                <>
                  <div>
                    <label className={labelCls}>Live publishable key (optional)</label>
                    <input type="text" className={inputCls} value={publishableKey}
                      onChange={e => setPublishableKey(e.target.value)} placeholder="pk_live_..." maxLength={256} />
                    <p className={hintCls}>Not secret. Live keys only (pk_live_…).</p>
                  </div>
                  <div>
                    <label className={labelCls}>{live.secretKeyConfigured ? 'Replace live secret key' : 'Live secret key'}</label>
                    <input type="password" className={inputCls} value={secretKey}
                      onChange={e => setSecretKey(e.target.value)} autoComplete="off"
                      placeholder={live.secretKeyConfigured ? `Configured ••••${live.secretKeyLast4 ?? ''} — leave blank to keep` : 'sk_live_...'} />
                    <p className={hintCls}>Write-only. Live keys only (sk_live_…). Leave blank to keep the current key.</p>
                  </div>
                  <div>
                    <label className={labelCls}>{live.webhookSecretConfigured ? 'Replace live webhook signing secret' : 'Live webhook signing secret'}</label>
                    <input type="password" className={inputCls} value={webhookSecret}
                      onChange={e => setWebhookSecret(e.target.value)} autoComplete="off"
                      placeholder={live.webhookSecretConfigured ? `Configured ••••${live.webhookSecretLast4 ?? ''} — leave blank to keep` : 'whsec_...'} />
                    <p className={hintCls}>Write-only (whsec_…) from the LIVE webhook endpoint. Leave blank to keep the current secret.</p>
                  </div>
                  <div>
                    <label className={labelCls}>Success return URL (optional)</label>
                    <input type="url" className={inputCls} value={successUrl}
                      onChange={e => setSuccessUrl(e.target.value)} placeholder="https://www.otahuhuprint.com/checkout/success" maxLength={512} />
                    <p className={hintCls}>Must end in /checkout/success with no query string. Blank ⇒ uses server config.</p>
                  </div>
                  <div>
                    <label className={labelCls}>Cancel return URL (optional)</label>
                    <input type="url" className={inputCls} value={cancelUrl}
                      onChange={e => setCancelUrl(e.target.value)} placeholder="https://www.otahuhuprint.com/checkout/cancel" maxLength={512} />
                    <p className={hintCls}>Must end in /checkout/cancel with no query string. Blank ⇒ uses server config.</p>
                  </div>

                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={isEnabled} onChange={e => setIsEnabled(e.target.checked)} className="h-4 w-4" />
                    <span className="text-sm text-black/80">Enable Stripe live payments (requires both live secrets configured)</span>
                  </label>

                  <div>
                    <label className={labelCls}>Type <span className="font-mono text-red-600">{requiredPhrase}</span> to confirm</label>
                    <input type="text" className={inputCls} value={phrase}
                      onChange={e => setPhrase(e.target.value)} placeholder={requiredPhrase} autoComplete="off" />
                    <p className={hintCls}>Required for every live save — guards against accidental changes.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button onClick={handleSave} disabled={saving || busy || !phraseOk}
                      className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40">
                      {saving ? 'Saving…' : 'Save live settings'}
                    </button>
                    {live.isEnabled && (
                      !confirmDisable ? (
                        <button onClick={() => setConfirmDisable(true)} disabled={busy}
                          className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50">
                          Disable live payments…
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button onClick={() => setConfirmDisable(false)} disabled={busy} className="rounded-lg border border-black/[0.15] px-4 py-2.5 text-sm text-black/60 hover:bg-black/[0.04]">Cancel</button>
                          <button onClick={handleDisable} disabled={busy} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">Confirm disable</button>
                        </div>
                      )
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${toastTone === 'success' ? 'bg-black' : 'bg-red-600'}`}>
          {toast}
        </div>
      )}
    </div>
  )
}
