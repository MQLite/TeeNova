'use client'

import type { DeliveryMethod, PaymentRequirementType, PaymentStatus } from '@/types'

function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '$0.00'
  return `$${value.toFixed(2)}`
}

function calculateRequiredDeposit(total: number): number {
  return Math.ceil(total * 0.5 * 100) / 100
}

const PAYMENT_STATUS_LABELS: Partial<Record<PaymentStatus, string>> = {
  Unpaid:          'Payment required',
  DepositRequired: 'Deposit required',
  PartiallyPaid:   'Partially paid',
  DepositPaid:     'Deposit received',
  Paid:            'Fully paid',
}

interface Props {
  mode: 'checkout' | 'success'
  deliveryMethod?: DeliveryMethod | null
  totalAmount: number
  paymentRequirementType?: PaymentRequirementType | null
  requiredDepositAmount?: number | null
  requiredPaymentAmount?: number | null
  balanceAmount?: number | null
  paymentStatus?: PaymentStatus | null
  orderNumber?: string | null
}

export function PaymentRequirementSummary({
  mode,
  deliveryMethod,
  totalAmount,
  paymentRequirementType,
  requiredDepositAmount,
  requiredPaymentAmount,
  balanceAmount,
  paymentStatus,
  orderNumber,
}: Props) {
  if (mode === 'checkout' && !deliveryMethod) return null

  const isDeposit = mode === 'success'
    ? paymentRequirementType === 'DepositThenBalance'
    : deliveryMethod === 'Pickup'

  const requirementLabel = isDeposit ? 'Deposit required' : 'Full payment required'

  const dueNow = isDeposit
    ? (mode === 'success' && requiredDepositAmount != null ? requiredDepositAmount : calculateRequiredDeposit(totalAmount))
    : (mode === 'success' && requiredPaymentAmount != null ? requiredPaymentAmount : totalAmount)

  const dueLater = isDeposit
    ? (mode === 'success' && balanceAmount != null ? balanceAmount : Math.max(0, totalAmount - dueNow))
    : 0

  const dueNowLabel  = isDeposit ? 'Deposit due now'    : 'Full payment due'
  const dueLaterLabel = isDeposit ? 'Balance due at pickup' : 'Balance due'

  const helperText = isDeposit
    ? (mode === 'success'
        ? 'Please pay the deposit using the payment details provided by the shop. Use your order number as the payment reference. The remaining balance is payable when you pick up your order.'
        : 'A minimum 50% deposit is required before we start processing your order. The remaining balance is payable when you pick up your order.')
    : (mode === 'success'
        ? 'Please pay the full amount using the payment details provided by the shop. Use your order number as the payment reference. We will start processing your order once payment is confirmed.'
        : 'Full payment is required before we start processing shipping orders.')

  const statusLabel = paymentStatus ? PAYMENT_STATUS_LABELS[paymentStatus] : null

  return (
    <div className="space-y-3">

      {/* Requirement label + payment status badge */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-black/[0.10] bg-black/[0.03] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.54px] text-black/65">
          {requirementLabel}
        </span>
        {statusLabel && (
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.54px] text-amber-700">
            {statusLabel}
          </span>
        )}
      </div>

      {/* Amount breakdown */}
      <div className="space-y-2 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3">
        <AmountRow label="Order Total"  value={formatMoney(totalAmount)} />
        <AmountRow label={dueNowLabel}  value={formatMoney(dueNow)}      highlight />
        <AmountRow label={dueLaterLabel} value={formatMoney(dueLater)} />
      </div>

      {/* Payment reference row — success mode only */}
      {orderNumber && (
        <div className="flex items-center justify-between rounded-xl border border-black/[0.08] bg-white px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">
            Payment Reference
          </span>
          <span className="font-mono text-sm text-black" style={{ fontWeight: 540 }}>
            #{orderNumber}
          </span>
        </div>
      )}

      {/* Instructions */}
      <p className="text-sm leading-relaxed text-black/55" style={{ letterSpacing: '-0.14px' }}>
        {helperText}
      </p>

      {/* Payment details — success mode: no bank details configured yet */}
      {mode === 'success' && (
        <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3">
          <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">
            Payment Details
          </p>
          <p className="text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
            Please contact the shop for payment details.
          </p>
        </div>
      )}

    </div>
  )
}

function AmountRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">{label}</span>
      <span
        className={highlight ? 'text-sm text-black' : 'text-sm text-black/70'}
        style={highlight ? { fontWeight: 540, letterSpacing: '-0.14px' } : { letterSpacing: '-0.14px' }}
      >
        {value}
      </span>
    </div>
  )
}
