'use client'

import { useState, useEffect } from 'react'
import { ordersApi } from '@/api/orders'

interface Props {
  orderId: string
  initialNotes: string | null
  disabled?: boolean
  onSaved?: (notes: string | null) => void
}

export function NotesPanel({ orderId, initialNotes, disabled = false, onSaved }: Props) {
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(false)

  // Keep in sync if parent refreshes the order
  useEffect(() => {
    setNotes(initialNotes ?? '')
  }, [initialNotes])

  async function handleSave() {
    if (disabled) return

    setSaving(true)
    setError(false)
    try {
      const updated = await ordersApi.updateAdminNotes(orderId, notes.trim() || null)
      onSaved?.(updated.adminNotes)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError(true)
      setTimeout(() => setError(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const isDirty = notes.trim() !== (initialNotes ?? '').trim()

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
          Admin Notes
        </h2>
        {saved && !error && (
          <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-green-600">
            Saved
          </span>
        )}
        {error && (
          <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-red-500">
            Failed to save
          </span>
        )}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        readOnly={disabled}
        placeholder="Internal review notes, print instructions, quality flags…"
        rows={4}
        className="w-full resize-none rounded-lg border border-black/[0.12] bg-white px-3 py-2.5 text-sm text-black placeholder:text-black/30 focus:border-black focus:outline-none focus:outline-dashed focus:outline-2 focus:outline-black focus:outline-offset-2 read-only:cursor-not-allowed read-only:bg-black/[0.03] read-only:text-black/55"
        style={{ letterSpacing: '-0.14px' }}
      />

      <div className="mt-2.5 flex items-center justify-between">
        <p className="text-[11px] text-black/35" style={{ letterSpacing: '-0.14px' }}>
          {disabled
            ? 'Visible to admin only. Locked while the order is cancelled.'
            : 'Visible to admin only. Not shared with customer.'}
        </p>
        <button
          onClick={handleSave}
          disabled={disabled || saving || !isDirty}
          className="rounded-[50px] bg-black px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.54px] text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {saving ? 'Saving…' : 'Save Notes'}
        </button>
      </div>
    </div>
  )
}
