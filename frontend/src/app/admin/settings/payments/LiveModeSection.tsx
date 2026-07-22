'use client'

import { useState } from 'react'
import { makePaymentSettingsApi } from '@/api/payment-settings'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import type { PaymentSettingsOverview } from '@/types'

const paymentSettingsApi = makePaymentSettingsApi(adminApiClient)

const inputCls   = 'w-full rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:border-black/30 focus:outline-none disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-black/40'
const labelCls   = 'block mb-1.5 text-sm text-black/70'
const hintCls    = 'mt-1 text-xs text-black/40'
const sectionCls = 'mb-1.5 text-[11px] font-semibold uppercase tracking-[0.54px] text-black/40'

type Tone = 'success' | 'error'

/**
 * Live Mode configuration panel (Jira 9908).
 *
 * When the server-side unlock flag (OnlinePayments:AllowLiveModeConfiguration) is off, the panel renders a
 * LOCKED card with no secret inputs. When unlocked, it renders a strongly-warned write-only form that
 * requires typing the exact confirmation phrase before any save. Secrets are never echoed — only masked
 * last-4 status from the server. Saving live keys does NOT route public checkout to Live; that is a separate
 * server-side switch (OnlinePayments:ActiveMode), stated explicitly in the panel.
 */
export default function LiveModeSection({
  canWrite,
  overview,
  onChanged,
  showToast,
}: {
  canWrite: boolean
  overview: PaymentSettingsOverview
  onChanged: () => void
  showToast: (msg: string, tone?: Tone) => void
}) {
  const unlocked = overview.liveModeConfigurationUnlocked
  const live = overview.live
  const requiredPhrase = overview.liveConfirmationPhrase || 'ENABLE LIVE MODE'

  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)

  // Write-only secret inputs — never populated from the server, cleared after save.
  const [secretKey, setSecretKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')

  // Editable non-secret fields.
  const [isEnabled, setIsEnabled] = useState(live.isEnabled)
  const [publishableKey, setPublishableKey] = useState(live.publishableKey ?? '')
  const [successUrl, setSuccessUrl] = useState(live.successReturnBaseUrl ?? '')
  const [cancelUrl, setCancelUrl] = useState(live.cancelReturnBaseUrl ?? '')

  // Deliberate-intent confirmation gate.
  const [phrase, setPhrase] = useState('')
  const phraseOk = phrase.trim() === requiredPhrase

  // ── Locked state ──────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div>
        <p className={sectionCls}>Live Mode</p>
        <div className="flex items-start gap-3 rounded-xl border border-black/[0.08] bg-black/[0.02] p-5">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-black/40" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm font-medium text-black/70">Live mode is locked</p>
            <p className="mt-1 text-sm text-black/50">
              Complete the Jira 9907 live-payment enablement checklist and enable the server-side unlock first.
              An operator must set <code className="text-black/70">OnlinePayments:AllowLiveModeConfiguration=true</code>
              {' '}(via <code className="text-black/70">/etc/teenova/api.env</code> or user-secrets) and restart the API.
              Until then, live keys (<code className="text-black/70">sk_live_</code>) are rejected on save.
            </p>
            <p className="mt-2 text-xs text-black/40">
              Unlocking configuration does not by itself make checkout live — routing public checkout to Live is a
              separate deliberate switch (<code className="text-black/60">OnlinePayments:ActiveMode=Live</code>).
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Unlocked state ────────────────────────────────────────────────────────
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
      showToast('Stripe Live settings saved.')
      onChanged()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
      // Never surface the submitted secret — clear the write-only inputs on error too.
      setSecretKey('')
      setWebhookSecret('')
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
      showToast('Stripe Live mode disabled.')
      onChanged()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
      showToast(err instanceof Error ? err.message : 'Failed to disable.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className={sectionCls}>Live Mode</p>
      <div className="space-y-4 rounded-xl border border-red-200 bg-red-50/40 p-5">

        {/* Strong warning */}
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          <div className="text-sm text-red-800">
            <p className="font-semibold">Live mode handles real money.</p>
            <p className="mt-0.5 text-red-700/90">
              Only enter Stripe <strong>live</strong> keys (<code>sk_live_</code> / <code>whsec_</code>, optional
              {' '}<code>pk_live_</code>) obtained from the Stripe Dashboard in Live mode. Live keys are encrypted at
              rest and never displayed again. Saving here does <strong>not</strong> route public checkout to Live —
              that requires setting <code>OnlinePayments:ActiveMode=Live</code> on the server (deliberate & separate).
            </p>
          </div>
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
            <span className="text-sm text-black/70">Live secret key</span>
            <span className="font-mono text-xs text-black/60">{live.secretKeyConfigured ? `configured ••••${live.secretKeyLast4 ?? ''}` : 'missing'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-black/70">Live webhook secret</span>
            <span className="font-mono text-xs text-black/60">{live.webhookSecretConfigured ? `configured ••••${live.webhookSecretLast4 ?? ''}` : 'missing'}</span>
          </div>
        </div>

        {!canWrite && (
          <p className="text-xs text-black/40">Read-only — only an Admin can change live settings.</p>
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
  )
}
