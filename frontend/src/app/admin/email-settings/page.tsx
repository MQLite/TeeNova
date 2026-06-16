'use client'

import { useEffect, useState } from 'react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { makeEmailSettingsApi } from '@/api/email-settings'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import type { EmailSettings } from '@/types'

const emailSettingsApi = makeEmailSettingsApi(adminApiClient)

const EMPTY: EmailSettings = {
  adminNotificationEmail: null,
  replyToAddress:         null,
  senderName:             null,
  shopContactInfo:        null,
  readyPickupMessage:     null,
  readyShippingMessage:   null,
  completedMessage:       null,
  adminOrderBaseUrl:      null,
}

export default function EmailSettingsPage() {
  const [settings,  setSettings]  = useState<EmailSettings>(EMPTY)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState<string | null>(null)
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success')

  function showToast(msg: string, tone: 'success' | 'error' = 'success') {
    setToast(msg)
    setToastTone(tone)
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    emailSettingsApi.get()
      .then(setSettings)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
        showToast('Failed to load settings.', 'error')
      })
      .finally(() => setLoading(false))
  }, [])

  function set(field: keyof EmailSettings, value: string) {
    setSettings(prev => ({ ...prev, [field]: value || null }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await emailSettingsApi.update(settings)
      setSettings(updated)
      showToast('Settings saved.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save settings.'
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-page admin-stack">
        <AdminPageHeader
          title="Email Settings"
          subtitle="Configure email notification settings."
        />
        <div className="max-w-2xl space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-black/[0.04]" />
          ))}
        </div>
      </div>
    )
  }

  const inputCls    = 'w-full rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:border-black/30 focus:outline-none'
  const textareaCls = `${inputCls} resize-y`
  const labelCls    = 'block mb-1.5 text-sm text-black/70'
  const hintCls     = 'mt-1 text-xs text-black/40'
  const sectionCls  = 'mb-1.5 text-[11px] font-semibold uppercase tracking-[0.54px] text-black/40'

  return (
    <div className="admin-page admin-stack">
      <AdminPageHeader
        title="Email Settings"
        subtitle="Configure business-level email notification settings."
      />

      <div className="max-w-2xl space-y-6">

        {/* ── Sender & Recipients ─────────────────────────────────────────── */}
        <div>
          <p className={sectionCls}>Sender &amp; Recipients</p>
          <div className="space-y-4 rounded-xl border border-black/[0.08] bg-white p-5">
            <div>
              <label className={labelCls}>Sender display name</label>
              <input
                type="text"
                className={inputCls}
                value={settings.senderName ?? ''}
                onChange={e => set('senderName', e.target.value)}
                placeholder="e.g. Otahuhu Printing"
                maxLength={128}
              />
            </div>
            <div>
              <label className={labelCls}>Admin notification email</label>
              <input
                type="email"
                className={inputCls}
                value={settings.adminNotificationEmail ?? ''}
                onChange={e => set('adminNotificationEmail', e.target.value)}
                placeholder="admin@example.com"
                maxLength={256}
              />
              <p className={hintCls}>Receives a notification when a new order is placed.</p>
            </div>
            <div>
              <label className={labelCls}>Reply-to email</label>
              <input
                type="email"
                className={inputCls}
                value={settings.replyToAddress ?? ''}
                onChange={e => set('replyToAddress', e.target.value)}
                placeholder="hello@example.com"
                maxLength={256}
              />
            </div>
          </div>
        </div>

        {/* ── Customer Email Content ──────────────────────────────────────── */}
        <div>
          <p className={sectionCls}>Customer Email Content</p>
          <div className="rounded-xl border border-black/[0.08] bg-white p-5">
            <label className={labelCls}>Shop contact info</label>
            <textarea
              className={textareaCls}
              value={settings.shopContactInfo ?? ''}
              onChange={e => set('shopContactInfo', e.target.value)}
              placeholder="Questions? Contact us at hello@example.com or call..."
              maxLength={1000}
              rows={3}
            />
            <p className={hintCls}>Shown in the footer of all customer emails.</p>
          </div>
        </div>

        {/* ── Ready Email Messages ────────────────────────────────────────── */}
        <div>
          <p className={sectionCls}>Ready Email Messages</p>
          <div className="space-y-4 rounded-xl border border-black/[0.08] bg-white p-5">
            <div>
              <label className={labelCls}>Ready message — Pickup</label>
              <textarea
                className={textareaCls}
                value={settings.readyPickupMessage ?? ''}
                onChange={e => set('readyPickupMessage', e.target.value)}
                placeholder="Your order is ready for pickup. Please visit us at your convenience."
                maxLength={500}
                rows={2}
              />
            </div>
            <div>
              <label className={labelCls}>Ready message — Shipping</label>
              <textarea
                className={textareaCls}
                value={settings.readyShippingMessage ?? ''}
                onChange={e => set('readyShippingMessage', e.target.value)}
                placeholder="Your order is ready and is being prepared for delivery."
                maxLength={500}
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* ── Completed Email Message ─────────────────────────────────────── */}
        <div>
          <p className={sectionCls}>Completed Email Message</p>
          <div className="rounded-xl border border-black/[0.08] bg-white p-5">
            <label className={labelCls}>Completed message</label>
            <textarea
              className={textareaCls}
              value={settings.completedMessage ?? ''}
              onChange={e => set('completedMessage', e.target.value)}
              placeholder="Thank you for your order. We hope you are happy with your prints!"
              maxLength={500}
              rows={2}
            />
          </div>
        </div>

        {/* ── Admin Links ─────────────────────────────────────────────────── */}
        <div>
          <p className={sectionCls}>Admin Links</p>
          <div className="rounded-xl border border-black/[0.08] bg-white p-5">
            <label className={labelCls}>Admin order base URL</label>
            <input
              type="text"
              className={inputCls}
              value={settings.adminOrderBaseUrl ?? ''}
              onChange={e => set('adminOrderBaseUrl', e.target.value)}
              placeholder="https://admin.example.com/admin/orders"
              maxLength={512}
            />
            <p className={hintCls}>
              Generates deep links in admin notification emails. Leave blank to omit.
            </p>
          </div>
        </div>

        {/* ── Save ────────────────────────────────────────────────────────── */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-black px-6 py-2.5 text-sm text-white transition-opacity hover:opacity-85 disabled:opacity-40"
            style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={[
            'fixed bottom-6 right-6 z-50 rounded-[50px] px-5 py-2.5 text-sm text-white shadow-lg',
            toastTone === 'error' ? 'bg-red-600' : 'bg-black',
          ].join(' ')}
          style={{ letterSpacing: '-0.14px' }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
