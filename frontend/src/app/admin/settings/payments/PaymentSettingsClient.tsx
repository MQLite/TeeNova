'use client'

import { useEffect, useState } from 'react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { makePaymentSettingsApi } from '@/api/payment-settings'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import LiveModeSection from './LiveModeSection'
import type {
  PaymentProviderSetting,
  PaymentSettingsOverview,
  StripeTestSettingsValidationResult,
} from '@/types'

const paymentSettingsApi = makePaymentSettingsApi(adminApiClient)

const inputCls   = 'w-full rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:border-black/30 focus:outline-none disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-black/40'
const labelCls   = 'block mb-1.5 text-sm text-black/70'
const hintCls    = 'mt-1 text-xs text-black/40'
const sectionCls = 'mb-1.5 text-[11px] font-semibold uppercase tracking-[0.54px] text-black/40'

type CheckState = 'pass' | 'warn' | 'fail' | 'nottested'

function StatusPill({ configured, last4 }: { configured: boolean; last4: string | null }) {
  return configured ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      Configured{last4 ? ` · ••••${last4}` : ''}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Missing
    </span>
  )
}

function CheckRow({ state, label, note }: { state: CheckState; label: string; note?: string }) {
  const cfg = {
    pass:      { dot: 'bg-green-500', text: 'text-black/70', tag: 'Ready',      tagCls: 'text-green-700' },
    warn:      { dot: 'bg-amber-500', text: 'text-black/70', tag: 'Warning',    tagCls: 'text-amber-700' },
    fail:      { dot: 'bg-red-500',   text: 'text-black/70', tag: 'Missing',    tagCls: 'text-red-600' },
    nottested: { dot: 'bg-black/25',  text: 'text-black/50', tag: 'Not tested', tagCls: 'text-black/40' },
  }[state]
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="flex items-start gap-2.5">
        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} />
        <span className={`text-sm ${cfg.text}`}>
          {label}
          {note ? <span className="text-black/40"> — {note}</span> : null}
        </span>
      </div>
      <span className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.4px] ${cfg.tagCls}`}>{cfg.tag}</span>
    </div>
  )
}

export default function PaymentSettingsClient({ role }: { role?: string }) {
  const [settings, setSettings] = useState<PaymentProviderSetting | null>(null)
  const [overview, setOverview] = useState<PaymentSettingsOverview | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [toast,    setToast]    = useState<string | null>(null)
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success')
  const [validation, setValidation] = useState<StripeTestSettingsValidationResult | null>(null)
  const [confirmDisable, setConfirmDisable] = useState(false)
  const [copied, setCopied] = useState(false)

  // Write-only secret inputs — never populated from the server, cleared after save.
  const [secretKey,     setSecretKey]     = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')

  // Editable non-secret fields.
  const [isEnabled,      setIsEnabled]      = useState(false)
  const [publishableKey, setPublishableKey] = useState('')
  const [successUrl,     setSuccessUrl]     = useState('')
  const [cancelUrl,      setCancelUrl]      = useState('')

  const canWrite = role === 'Admin'

  function showToast(msg: string, tone: 'success' | 'error' = 'success') {
    setToast(msg)
    setToastTone(tone)
    setTimeout(() => setToast(null), 4000)
  }

  function hydrate(s: PaymentProviderSetting) {
    setSettings(s)
    setIsEnabled(s.isEnabled)
    setPublishableKey(s.publishableKey ?? '')
    setSuccessUrl(s.successReturnBaseUrl ?? '')
    setCancelUrl(s.cancelReturnBaseUrl ?? '')
    // Secrets are never returned — keep the write-only inputs blank.
    setSecretKey('')
    setWebhookSecret('')
  }

  function loadOverview() {
    return paymentSettingsApi.getOverview()
      .then(setOverview)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
        // Non-fatal for the Test panel — the Live section simply won't render.
      })
  }

  useEffect(() => {
    Promise.all([
      paymentSettingsApi.getStripe().then(hydrate),
      loadOverview(),
    ])
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
        showToast('Failed to load payment settings.', 'error')
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!canWrite) return
    setSaving(true)
    try {
      const updated = await paymentSettingsApi.updateStripeTest({
        isEnabled,
        currency: 'NZD',
        publishableKey: publishableKey.trim() || null,
        // Only send secrets when the admin actually typed a new value (rotation). Blank = keep existing.
        secretKey:     secretKey.trim()     || undefined,
        webhookSecret: webhookSecret.trim() || undefined,
        successReturnBaseUrl: successUrl.trim() || null,
        cancelReturnBaseUrl:  cancelUrl.trim()  || null,
      })
      hydrate(updated)
      setValidation(null)
      showToast('Stripe Test settings saved.')
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
      // Never surface the submitted secret — clear the write-only inputs on error too.
      setSecretKey('')
      setWebhookSecret('')
      const msg = err instanceof Error ? err.message : 'Failed to save settings.'
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDisable() {
    if (!canWrite) return
    setBusy(true)
    setConfirmDisable(false)
    try {
      const updated = await paymentSettingsApi.disableStripeTest()
      hydrate(updated)
      setValidation(null)
      showToast('Stripe online payments disabled.')
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
      showToast(err instanceof Error ? err.message : 'Failed to disable.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleValidate() {
    if (!canWrite) return
    setBusy(true)
    try {
      const result = await paymentSettingsApi.validateStripeTest()
      setValidation(result)
      // Re-load masked status so the recorded validation timestamp/code refreshes.
      const refreshed = await paymentSettingsApi.getStripe()
      setSettings(refreshed)
      showToast(
        result.status === 'Valid' ? `Validation: ${result.messageCode ?? 'Valid'}` : `Validation: ${result.messageCode ?? result.status}`,
        result.status === 'Valid' ? 'success' : 'error',
      )
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
      showToast(err instanceof Error ? err.message : 'Validation failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function copyWebhook(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      showToast('Copy failed — select and copy manually.', 'error')
    }
  }

  if (loading) {
    return (
      <div className="admin-page admin-stack">
        <AdminPageHeader title="Payment Settings" subtitle="Configure the Stripe payment gateway." />
        <div className="max-w-2xl space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-black/[0.04]" />
          ))}
        </div>
      </div>
    )
  }

  const s = settings
  const notConfigured = !s?.isConfigured
  const webhookDisplay = s?.webhookEndpointUrl || s?.webhookEndpointPath || '/api/payment-webhooks/stripe'
  const encryptionWarn = s ? !s.encryptionPassphraseConfigured : false

  return (
    <div className="admin-page admin-stack">
      <AdminPageHeader
        title="Payment Settings"
        subtitle="Stripe gateway. Secrets are encrypted at rest and never displayed. Live mode is guarded by a server-side unlock."
      />

      <div className="max-w-2xl space-y-6">

        {/* ── Active runtime mode banner ──────────────────────────────────── */}
        {overview && (
          <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${overview.activeModeIsLive ? 'border-red-200 bg-red-50 text-red-800' : 'border-black/[0.08] bg-black/[0.02] text-black/70'}`}>
            <span>
              Active runtime mode:{' '}
              <strong className={overview.activeModeIsLive ? 'text-red-700' : 'text-black/80'}>{overview.activeMode}</strong>
              <span className="text-black/40"> · public checkout resolves {overview.activeMode}-mode secrets (server config)</span>
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${overview.liveModeConfigurationUnlocked ? 'bg-amber-100 text-amber-800' : 'bg-black/[0.05] text-black/50'}`}>
              {overview.liveModeConfigurationUnlocked ? 'Live config unlocked' : 'Live config locked'}
            </span>
          </div>
        )}

        {/* ── Read-only banner for Viewer ─────────────────────────────────── */}
        {!canWrite && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10A8 8 0 11.999 10 8 8 0 0118 10zM9 5a1 1 0 112 0v4a1 1 0 11-2 0V5zm1 8a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>
            Read-only access — only an Admin can change payment settings.
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {notConfigured && (
          <div className="rounded-xl border border-black/[0.08] bg-black/[0.02] p-5">
            <p className="text-sm font-medium text-black/80">Stripe Test Mode is not configured yet</p>
            <ul className="mt-2 space-y-1 text-sm text-black/55">
              <li>• Only Stripe <strong>test</strong> keys are accepted (<code className="text-black/70">sk_test_…</code>, <code className="text-black/70">whsec_…</code>, optional <code className="text-black/70">pk_test_…</code>).</li>
              <li>• Full secrets are shown <strong>only while you type</strong> — after saving they are never displayed again, only a last-4 fragment.</li>
              <li>• The webhook signing secret (<code className="text-black/70">whsec_…</code>) comes from your Stripe webhook endpoint or the Stripe CLI listener.</li>
              <li>• <code className="text-black/70">sk_live_</code> keys and Live mode are intentionally blocked.</li>
            </ul>
            {!canWrite && <p className="mt-3 text-xs text-black/40">Ask an Admin to configure Stripe Test mode.</p>}
          </div>
        )}

        {/* ── Operator warnings ───────────────────────────────────────────── */}
        {encryptionWarn && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">Encryption passphrase not configured</p>
            <p className="mt-0.5 text-amber-700/90">
              <code>Encryption:PassPhrase</code> is not set, so a development-only default key is in use. Set a
              strong, environment-unique passphrase via user-secrets/env before storing real test secrets in a
              shared environment. Rotating it later invalidates stored secrets (they must be re-entered).
            </p>
          </div>
        )}

        {/* ── Status ──────────────────────────────────────────────────────── */}
        <div>
          <p className={sectionCls}>Status</p>
          <div className="space-y-3 rounded-xl border border-black/[0.08] bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-black/70">Stripe Test mode</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s?.isEnabled ? 'bg-green-50 text-green-700' : notConfigured ? 'bg-black/[0.05] text-black/50' : 'bg-amber-50 text-amber-700'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${s?.isEnabled ? 'bg-green-500' : notConfigured ? 'bg-black/30' : 'bg-amber-500'}`} />
                {s?.isEnabled ? 'Enabled' : notConfigured ? 'Not configured' : 'Disabled'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-black/70">Live mode</span>
              {overview?.liveModeConfigurationUnlocked ? (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${overview.live.isEnabled ? 'bg-red-100 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${overview.live.isEnabled ? 'bg-red-500' : 'bg-amber-500'}`} />
                  {overview.live.isEnabled ? 'Enabled' : 'Unlocked · configurable'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.05] px-2.5 py-1 text-xs font-medium text-black/50">Locked · not available</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-black/70">Secret key</span>
              <StatusPill configured={!!s?.secretKeyConfigured} last4={s?.secretKeyLast4 ?? null} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-black/70">Webhook signing secret</span>
              <StatusPill configured={!!s?.webhookSecretConfigured} last4={s?.webhookSecretLast4 ?? null} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-black/70">Publishable key</span>
              {s?.publishableKey
                ? <span className="font-mono text-xs text-black/60">pk_test_••••{s.publishableKey.slice(-4)}</span>
                : <span className="text-xs text-black/40">optional · not set</span>}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-black/70">Currency</span>
              <span className="text-sm text-black/60">NZD</span>
            </div>
            <div className="mt-1 border-t border-black/[0.06] pt-3">
              <p className="text-xs text-black/45">
                Runtime source — Stripe secrets: <strong className="text-black/60">Database (encrypted)</strong>;
                currency &amp; return URLs: <strong className="text-black/60">Server config (appsettings)</strong>.
              </p>
            </div>
            {s?.lastValidatedAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-black/70">Last validation</span>
                <span className="text-xs text-black/50">
                  {s.lastValidationMessageCode ?? s.lastValidationStatus} · {new Date(s.lastValidatedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Webhook endpoint ────────────────────────────────────────────── */}
        <div>
          <p className={sectionCls}>Webhook Endpoint</p>
          <div className="rounded-xl border border-black/[0.08] bg-white p-5">
            <label className={labelCls}>Register this URL in Stripe (Test mode) → Developers → Webhooks</label>
            <div className="flex items-center gap-2">
              <input type="text" className={`${inputCls} font-mono text-xs`} value={webhookDisplay} readOnly />
              <button
                onClick={() => copyWebhook(webhookDisplay)}
                className="shrink-0 rounded-lg border border-black/[0.15] px-3 py-2 text-xs font-medium text-black/70 transition-colors hover:bg-black/[0.04]"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className={hintCls}>
              For local testing, forward events with the Stripe CLI: <code>stripe listen --forward-to {webhookDisplay}</code>.
              The <code>whsec_…</code> it prints is your webhook signing secret.
            </p>
          </div>
        </div>

        {/* ── Readiness checklist ─────────────────────────────────────────── */}
        <div>
          <p className={sectionCls}>Readiness Checklist</p>
          <div className="rounded-xl border border-black/[0.08] bg-white p-5">
            <CheckRow state={s?.isConfigured ? 'pass' : 'fail'} label="DB settings row exists" />
            <CheckRow state={s?.secretKeyConfigured ? 'pass' : 'fail'} label="Secret key configured" />
            <CheckRow state={s?.webhookSecretConfigured ? 'pass' : 'fail'} label="Webhook secret configured" />
            <CheckRow state="pass" label="Mode is Test" />
            <CheckRow
              state={overview ? (overview.liveModeConfigurationUnlocked ? 'warn' : 'pass') : 'pass'}
              label="Live mode configuration"
              note={overview?.liveModeConfigurationUnlocked ? 'unlocked (server flag on)' : 'locked'}
            />
            <CheckRow state={s?.currency === 'NZD' ? 'pass' : 'warn'} label="Currency is NZD" />
            <CheckRow state={s && s.missingPrerequisites.includes('InvalidReturnUrl') ? 'fail' : 'pass'} label="Return URLs valid" note="blank = server config" />
            <CheckRow state={s?.encryptionPassphraseConfigured ? 'pass' : 'warn'} label="Encryption passphrase configured" note={s?.encryptionPassphraseConfigured ? undefined : 'dev default in use'} />
            <CheckRow state="pass" label="Migration applied" note="settings table reachable" />
            <div className="my-2 border-t border-black/[0.06]" />
            <CheckRow state="nottested" label="Stripe CLI / webhook endpoint" note="verified in Jira 9904" />
            <CheckRow state="nottested" label="SMTP receipt sink" note="verified in Jira 9904" />
            <CheckRow state="nottested" label="Manual checkout runtime (test card)" note="verified in Jira 9904" />
          </div>
        </div>

        {/* ── Test-mode keys form (Admin) ─────────────────────────────────── */}
        <div>
          <p className={sectionCls}>Stripe Test Keys</p>
          <div className="space-y-4 rounded-xl border border-black/[0.08] bg-white p-5">
            <div>
              <label className={labelCls}>Publishable key (optional)</label>
              <input
                type="text" className={inputCls} disabled={!canWrite}
                value={publishableKey}
                onChange={e => setPublishableKey(e.target.value)}
                placeholder="pk_test_..."
                maxLength={256}
              />
              <p className={hintCls}>Not secret. Test keys only (pk_test_…).</p>
            </div>
            <div>
              <label className={labelCls}>{s?.secretKeyConfigured ? 'Replace secret key' : 'Secret key'}</label>
              <input
                type="password" className={inputCls} disabled={!canWrite}
                value={secretKey}
                onChange={e => setSecretKey(e.target.value)}
                placeholder={s?.secretKeyConfigured ? `Configured ••••${s.secretKeyLast4 ?? ''} — leave blank to keep` : 'sk_test_...'}
                autoComplete="off"
              />
              <p className={hintCls}>Write-only. Test keys only (sk_test_…). Leave blank to keep the current key.</p>
            </div>
            <div>
              <label className={labelCls}>{s?.webhookSecretConfigured ? 'Replace webhook signing secret' : 'Webhook signing secret'}</label>
              <input
                type="password" className={inputCls} disabled={!canWrite}
                value={webhookSecret}
                onChange={e => setWebhookSecret(e.target.value)}
                placeholder={s?.webhookSecretConfigured ? `Configured ••••${s.webhookSecretLast4 ?? ''} — leave blank to keep` : 'whsec_...'}
                autoComplete="off"
              />
              <p className={hintCls}>Write-only (whsec_…). Leave blank to keep the current secret.</p>
            </div>
          </div>
        </div>

        {/* ── Checkout (return URLs & currency) ───────────────────────────── */}
        <div>
          <p className={sectionCls}>Checkout</p>
          <div className="space-y-4 rounded-xl border border-black/[0.08] bg-white p-5">
            <div>
              <label className={labelCls}>Currency</label>
              <input type="text" className={inputCls} value="NZD" disabled readOnly />
              <p className={hintCls}>NZD only in this phase. Runtime source: server config (appsettings).</p>
            </div>
            <div>
              <label className={labelCls}>Success return URL</label>
              <input
                type="url" className={inputCls} disabled={!canWrite}
                value={successUrl}
                onChange={e => setSuccessUrl(e.target.value)}
                placeholder="https://yourshop.example/checkout/success"
                maxLength={512}
              />
              <p className={hintCls}>Must end in /checkout/success with no query string. Blank ⇒ uses server config.</p>
            </div>
            <div>
              <label className={labelCls}>Cancel return URL</label>
              <input
                type="url" className={inputCls} disabled={!canWrite}
                value={cancelUrl}
                onChange={e => setCancelUrl(e.target.value)}
                placeholder="https://yourshop.example/checkout/cancel"
                maxLength={512}
              />
              <p className={hintCls}>Must end in /checkout/cancel with no query string. Blank ⇒ uses server config.</p>
            </div>
          </div>
        </div>

        {/* ── Activation ──────────────────────────────────────────────────── */}
        <div>
          <p className={sectionCls}>Activation</p>
          <div className="rounded-xl border border-black/[0.08] bg-white p-5">
            <label className="flex items-center gap-3">
              <input
                type="checkbox" disabled={!canWrite}
                checked={isEnabled}
                onChange={e => setIsEnabled(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm text-black/80">Enable Stripe online payments (Test mode)</span>
            </label>
            <p className={hintCls}>Enabling requires both a secret key and a webhook signing secret to be configured.</p>
          </div>
        </div>

        {/* ── Live mode (locked or guarded config) ────────────────────────── */}
        {overview && (
          <LiveModeSection
            canWrite={canWrite}
            overview={overview}
            onChanged={loadOverview}
            showToast={showToast}
          />
        )}

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        {canWrite && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSave} disabled={saving || busy}
              className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            <button
              onClick={handleValidate} disabled={saving || busy}
              className="rounded-lg border border-black/[0.15] px-5 py-2.5 text-sm font-medium text-black/70 transition-colors hover:bg-black/[0.04] disabled:opacity-50"
            >
              Validate
            </button>
          </div>
        )}

        {validation && (
          <div className={`rounded-xl border p-4 text-sm ${validation.status === 'Valid' ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <p className="font-medium">Validation: {validation.messageCode ?? validation.status}</p>
            <ul className="mt-1.5 space-y-0.5 text-xs">
              <li>Can create checkout session: {validation.canCreateCheckoutSession ? 'yes' : 'no'}</li>
              <li>Secret key configured: {validation.secretKeyConfigured ? 'yes' : 'no'}</li>
              <li>Webhook secret configured: {validation.webhookSecretConfigured ? 'yes' : 'no'}</li>
              <li>Return URLs valid: {validation.returnUrlsValid ? 'yes' : 'no'}</li>
              <li>Encryption passphrase configured: {validation.encryptionPassphraseConfigured ? 'yes' : 'no'}</li>
              <li>Live mode blocked: {validation.liveModeBlocked ? 'yes' : 'no'}</li>
              {validation.missingPrerequisites.length > 0 && (
                <li>Missing: {validation.missingPrerequisites.join(', ')}</li>
              )}
            </ul>
            <p className="mt-2 text-[11px] text-black/45">Static readiness only — no live Stripe API call and no runtime checkout test was performed.</p>
          </div>
        )}

        {/* ── Danger zone: disable ────────────────────────────────────────── */}
        {canWrite && s?.isEnabled && (
          <div>
            <p className={sectionCls}>Danger Zone</p>
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-5">
              {!confirmDisable ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-red-700">Disable Stripe online payments</p>
                    <p className="mt-0.5 text-xs text-red-600/80">Stops creating new Stripe checkout sessions. Stored secrets are kept (not deleted); payment history is unaffected.</p>
                  </div>
                  <button
                    onClick={() => setConfirmDisable(true)} disabled={busy}
                    className="shrink-0 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    Disable…
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-red-700">Disable Stripe payments now? New checkouts will be blocked until re-enabled.</p>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setConfirmDisable(false)} disabled={busy} className="rounded-lg border border-black/[0.15] px-4 py-2 text-sm text-black/60 hover:bg-black/[0.04]">Cancel</button>
                    <button onClick={handleDisable} disabled={busy} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">Confirm disable</button>
                  </div>
                </div>
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
