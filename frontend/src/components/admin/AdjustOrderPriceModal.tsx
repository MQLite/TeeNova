'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { AdjustOrderPriceInput, Order } from '@/types'

// ── Field style constants (matches existing admin form style) ─────────────────

const FIELD_BASE = [
  'w-full rounded-2xl border border-black/[0.10] bg-white px-4 py-3 text-sm text-black',
  'placeholder:text-black/30',
  'focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/[0.06]',
  'disabled:opacity-50',
].join(' ')

const LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55'

const REASON_MAX = 1000

// ── Helpers ───────────────────────────────────────────────────────────────────

function money(value: number): string {
  return `$${value.toFixed(2)}`
}

function signedAmount(value: number): string {
  const sign = value >= 0 ? '+' : '-'
  return `${sign}${Math.abs(value).toFixed(2)} NZD`
}

// Mirrors backend deposit rule: Math.Ceiling(total * 0.50 * 100) / 100.
function computeRequiredDeposit(total: number): number {
  return Math.ceil(total * 0.5 * 100) / 100
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">{label}</span>
      <span className="text-sm text-black/70" style={{ letterSpacing: '-0.14px' }}>{value}</span>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  order: Order
  open: boolean
  onClose: () => void
  onSubmit: (input: AdjustOrderPriceInput) => Promise<void>
}

export function AdjustOrderPriceModal({ order, open, onClose, onSubmit }: Props) {
  const [newTotal, setNewTotal] = useState('')
  const [reason,   setReason]   = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setNewTotal(order.totalAmount.toFixed(2))
      setReason('')
      setError(null)
    }
  }, [open, order])

  const parsedTotal = parseFloat(newTotal)
  const hasValidNumber = !isNaN(parsedTotal) && parsedTotal > 0

  const adjustment = hasValidNumber ? parsedTotal - order.totalAmount : 0
  const newBalancePreview = hasValidNumber ? parsedTotal - order.paidAmount : 0
  const belowPaid = hasValidNumber && parsedTotal < order.paidAmount

  // ── Warnings (advisory only, do not block submit) ───────────────────────────
  const warnings = useMemo(() => {
    const list: string[] = []
    if (!hasValidNumber) return list

    if (order.paymentStatus === 'Paid' && parsedTotal > order.paidAmount) {
      list.push('This order is currently fully paid. Increasing the total will create a new balance due.')
    }

    if (
      order.paymentRequirementType === 'DepositThenBalance' &&
      parsedTotal > order.totalAmount &&
      computeRequiredDeposit(parsedTotal) > order.paidAmount
    ) {
      list.push('This may move the order back below the required deposit threshold.')
    }

    if (order.status === 'Printing' || order.status === 'Ready') {
      list.push('This order is already in production or ready. Confirm the price change is intentional.')
    }

    return list
  }, [hasValidNumber, parsedTotal, order])

  const reasonTrimmed = reason.trim()
  const canSubmit =
    !saving &&
    hasValidNumber &&
    !belowPaid &&
    reasonTrimmed.length > 0 &&
    reason.length <= REASON_MAX

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (isNaN(parsedTotal) || parsedTotal <= 0) {
      setError('New total must be greater than zero.')
      return
    }
    if (parsedTotal < order.paidAmount) {
      setError(`New total cannot be less than the amount already paid (${money(order.paidAmount)}).`)
      return
    }
    if (reasonTrimmed.length === 0) {
      setError('Please enter a reason for this adjustment.')
      return
    }
    if (reason.length > REASON_MAX) {
      setError(`Reason cannot exceed ${REASON_MAX} characters.`)
      return
    }

    setSaving(true)
    try {
      await onSubmit({ newTotalAmount: parsedTotal, reason: reasonTrimmed })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to adjust price. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Adjust Order Price">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Current figures (read-only) */}
        <div className="space-y-2 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3">
          <ReadOnlyRow label="Current Total" value={money(order.totalAmount)} />
          <ReadOnlyRow label="Paid Amount" value={money(order.paidAmount)} />
          <ReadOnlyRow label="Current Balance Due" value={money(order.balanceAmount)} />
        </div>

        {/* New total amount */}
        <div>
          <label className={LABEL}>
            New Total Amount <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/40">
              $
            </span>
            <input
              type="number"
              value={newTotal}
              onChange={(e) => setNewTotal(e.target.value)}
              min="0.01"
              step="0.01"
              placeholder="0.00"
              disabled={saving}
              className={`${FIELD_BASE} pl-8`}
            />
          </div>
        </div>

        {/* Calculated adjustment + new balance preview */}
        {hasValidNumber && (
          <div className="space-y-2 rounded-2xl border border-black/[0.06] bg-white px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Adjustment</span>
              <span
                className="text-sm"
                style={{ letterSpacing: '-0.14px', fontWeight: 540, color: adjustment >= 0 ? '#15803d' : '#b91c1c' }}
              >
                {signedAmount(adjustment)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-black/[0.06] pt-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">New Balance Due</span>
              <span className="text-sm text-black" style={{ letterSpacing: '-0.14px', fontWeight: 540 }}>
                {money(newBalancePreview)}
              </span>
            </div>
          </div>
        )}

        {/* Inline below-paid error (pre-submit block) */}
        {belowPaid && (
          <p
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            style={{ letterSpacing: '-0.14px' }}
          >
            New total cannot be less than the amount already paid ({money(order.paidAmount)}).
          </p>
        )}

        {/* Warnings */}
        {warnings.map((w) => (
          <p
            key={w}
            className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            style={{ letterSpacing: '-0.14px' }}
          >
            {w}
          </p>
        ))}

        {/* Reason */}
        <div>
          <label className={LABEL}>
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer requested upgrade to premium print"
            maxLength={REASON_MAX}
            rows={3}
            disabled={saving}
            className={`${FIELD_BASE} resize-none`}
          />
          <p className="mt-1 font-mono text-[10px] text-black/40 tracking-[0.02em]">
            {reason.length}/{REASON_MAX}
          </p>
        </div>

        {/* API / business error */}
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
          <Button type="submit" size="sm" loading={saving} disabled={!canSubmit}>
            Apply Adjustment
          </Button>
          <Button type="button" variant="glass" size="sm" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
        </div>

      </form>
    </Modal>
  )
}
