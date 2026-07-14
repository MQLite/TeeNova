'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { ManualPaymentMethod, Order, RecordPaymentInput } from '@/types'

// ── Field style constants (matches existing admin form style) ─────────────────

const FIELD_BASE = [
  'w-full rounded-2xl border border-black/[0.10] bg-white px-4 py-3 text-sm text-black',
  'placeholder:text-black/30',
  'focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/[0.06]',
  'disabled:opacity-50',
].join(' ')

const LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55'

const METHOD_OPTIONS: { value: ManualPaymentMethod; label: string }[] = [
  { value: 'BankTransfer', label: 'Bank Transfer' },
  { value: 'Cash',         label: 'Cash' },
  { value: 'Eftpos',       label: 'Eftpos' },
  { value: 'Online',       label: 'Online' },
  { value: 'Other',        label: 'Other' },
]

// ── Default amount logic ──────────────────────────────────────────────────────

function computeDefaultAmount(order: Order): string {
  if (order.balanceAmount <= 0) return ''
  if (
    order.paymentRequirementType === 'DepositThenBalance' &&
    order.requiredDepositAmount != null &&
    order.paidAmount < order.requiredDepositAmount
  ) {
    return (order.requiredDepositAmount - order.paidAmount).toFixed(2)
  }
  return order.balanceAmount.toFixed(2)
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  order: Order
  open: boolean
  onClose: () => void
  onSubmit: (input: RecordPaymentInput) => Promise<void>
}

export function RecordPaymentModal({ order, open, onClose, onSubmit }: Props) {
  const [amount,    setAmount]    = useState('')
  const [method,    setMethod]    = useState<ManualPaymentMethod>('BankTransfer')
  const [reference, setReference] = useState('')
  const [note,      setNote]      = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setAmount(computeDefaultAmount(order))
      setMethod('BankTransfer')
      setReference('')
      setNote('')
      setError(null)
    }
  }, [open, order])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) {
      setError('Amount must be greater than zero.')
      return
    }
    if (parsed > order.balanceAmount) {
      setError(`Amount cannot exceed the balance due of $${order.balanceAmount.toFixed(2)}.`)
      return
    }
    if (reference.length > 256) {
      setError('Reference cannot exceed 256 characters.')
      return
    }
    if (note.length > 1000) {
      setError('Note cannot exceed 1000 characters.')
      return
    }

    setSaving(true)
    try {
      await onSubmit({
        amount:    parsed,
        method,
        reference: reference.trim() || null,
        note:      note.trim() || null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record Payment" closeOnBackdropClick={false}>
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Amount */}
        <div>
          <label className={LABEL}>
            Amount <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/40">
              $
            </span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0.01"
              max={order.balanceAmount}
              step="0.01"
              placeholder="0.00"
              disabled={saving}
              className={`${FIELD_BASE} pl-8`}
            />
          </div>
          <p className="mt-1 font-mono text-[10px] text-black/40 tracking-[0.02em]">
            Balance due: ${order.balanceAmount.toFixed(2)}
          </p>
        </div>

        {/* Method */}
        <div>
          <label className={LABEL}>
            Payment Method <span className="text-red-500">*</span>
          </label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as ManualPaymentMethod)}
            disabled={saving}
            className={FIELD_BASE}
          >
            {METHOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Reference */}
        <div>
          <label className={LABEL}>
            Reference <span className="text-black/30 normal-case font-sans text-[11px] tracking-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. bank transfer ref, receipt number"
            maxLength={256}
            disabled={saving}
            className={FIELD_BASE}
          />
        </div>

        {/* Note */}
        <div>
          <label className={LABEL}>
            Note <span className="text-black/30 normal-case font-sans text-[11px] tracking-normal">(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. partial deposit, customer paid in person"
            maxLength={1000}
            rows={3}
            disabled={saving}
            className={`${FIELD_BASE} resize-none`}
          />
        </div>

        {/* Error */}
        {error && (
          <p
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            style={{ letterSpacing: '-0.14px' }}
          >
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 border-t border-black/[0.06] pt-4">
          <Button type="submit" size="sm" loading={saving}>
            Record Payment
          </Button>
          <Button type="button" variant="glass" size="sm" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
        </div>

      </form>
    </Modal>
  )
}
