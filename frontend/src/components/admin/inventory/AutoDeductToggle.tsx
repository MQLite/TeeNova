'use client'

import { useEffect, useState } from 'react'
import { makeInventorySettingsApi } from '@/api/inventory-settings'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import type { InventorySettings } from '@/types'

const settingsApi = makeInventorySettingsApi(adminApiClient)

export function AutoDeductToggle() {
  const [settings, setSettings] = useState<InventorySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    settingsApi.get()
      .then((s) => { if (active) setSettings(s) })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
        if (active) setError('Could not load inventory settings.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function toggle() {
    if (!settings || saving) return
    const next = !settings.autoDeductOnPressedEnabled
    setSaving(true)
    setError(null)
    try {
      const updated = await settingsApi.update({ ...settings, autoDeductOnPressedEnabled: next })
      setSettings(updated)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const enabled = settings?.autoDeductOnPressedEnabled ?? false
  const disabled = loading || saving

  return (
    <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Automation</p>
          <h2 className="mt-1 text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
            Auto-deduct stock when an order is marked Ready
          </h2>
          <p className="mt-1 max-w-xl text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
            When on, new orders automatically reduce variant stock once marked Ready. Orders placed
            before a change are never affected, and stock is never deducted below zero. Default off —
            inventory stays informational and never blocks checkout.
          </p>
          <p className="mt-2 text-xs text-black/40" style={{ letterSpacing: '-0.14px' }}>
            {loading
              ? 'Loading…'
              : saving
                ? 'Saving…'
                : enabled
                  ? 'On — new orders will deduct stock at Ready.'
                  : 'Off — no stock is deducted.'}
            {settings?.lastModificationTime && !loading && !saving && (
              <> · Last changed {new Date(settings.lastModificationTime).toLocaleDateString('en-NZ', { dateStyle: 'medium' })}</>
            )}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle auto-deduction"
          onClick={toggle}
          disabled={disabled}
          className={[
            'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
            enabled ? 'bg-green-500' : 'bg-black/15',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
              enabled ? 'translate-x-6' : 'translate-x-1',
            ].join(' ')}
          />
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700" style={{ letterSpacing: '-0.14px' }}>
          {error}
        </p>
      )}
    </section>
  )
}
