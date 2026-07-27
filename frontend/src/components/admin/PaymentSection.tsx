'use client'

import clsx from 'clsx'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatNzDateTime } from '@/lib/datetime'
import type { ManualPaymentMethod, Order, PaymentStatus } from '@/types'
import type { AdminOnlinePaymentSession } from '@/types'
import { AdminOnlinePaymentSessionCard } from './AdminOnlinePaymentSessionCard'

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { bg: string; text: string; dot: string; label: string }> = {
  Unpaid:          { bg: 'bg-zinc-100',   text: 'text-zinc-700',   dot: 'bg-zinc-400',   label: 'Unpaid' },
  DepositRequired: { bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-400',  label: 'Deposit Required' },
  DepositPaid:     { bg: 'bg-sky-50',     text: 'text-sky-700',    dot: 'bg-sky-500',    label: 'Deposit Paid' },
  PartiallyPaid:   { bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-400',   label: 'Partially Paid' },
  Paid:            { bg: 'bg-green-50',   text: 'text-green-700',  dot: 'bg-green-500',  label: 'Fully Paid' },
  Refunded:        { bg: 'bg-purple-50',  text: 'text-purple-700', dot: 'bg-purple-400', label: 'Refunded' },
  PaymentFailed:   { bg: 'bg-red-50',     text: 'text-red-700',    dot: 'bg-red-400',    label: 'Payment Failed' },
}

const METHOD_LABELS: Record<ManualPaymentMethod, string> = {
  Cash:         'Cash',
  Eftpos:       'Eftpos',
  BankTransfer: 'Bank Transfer',
  Online:       'Online',
  Other:        'Other',
}

function formatMoney(value: number | null | undefined): string {
  if (value == null) return '—'
  return `$${value.toFixed(2)}`
}

function formatSignedMoney(value: number): string {
  const sign = value >= 0 ? '+' : '-'
  return `${sign}$${Math.abs(value).toFixed(2)}`
}

function formatDate(iso: string | null | undefined): string {
  return formatNzDateTime(iso)
}

function AmountRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">{label}</span>
      <span
        className={clsx('text-sm', highlight ? 'text-black' : 'text-black/70')}
        style={highlight ? { fontWeight: 540, letterSpacing: '-0.14px' } : { letterSpacing: '-0.14px' }}
      >
        {value}
      </span>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  order: Order
  onlinePaymentSessions: AdminOnlinePaymentSession[]
  onRecordPayment: () => void
  onAdjustPrice: () => void
}

export function PaymentSection({ order, onlinePaymentSessions, onRecordPayment, onAdjustPrice }: Props) {
  const {
    paymentStatus,
    paymentRequirementType,
    requiredDepositAmount,
    paidAmount,
    balanceAmount,
    depositPaidAt,
    fullyPaidAt,
    lastPaymentMethod,
    lastPaymentReference,
    lastPaymentNote,
    paymentTransactions,
    status,
    hasPriceAdjustment,
    priceAdjustments,
  } = order

  const statusCfg = PAYMENT_STATUS_CONFIG[paymentStatus] ?? PAYMENT_STATUS_CONFIG.Unpaid
  const isDeposit = paymentRequirementType === 'DepositThenBalance'
  const isFullyPaid = balanceAmount <= 0
  const isCancelled = status === 'Cancelled'
  const isCompleted = status === 'Completed'

  let recordDisabledReason: string | null = null
  if (isCancelled)      recordDisabledReason = 'Cannot record payment for a cancelled order.'
  else if (isCompleted) recordDisabledReason = 'Cannot record payment for a completed order.'
  else if (isFullyPaid) recordDisabledReason = 'No balance remaining.'

  const canRecord = !recordDisabledReason

  let adjustDisabledReason: string | null = null
  if (isCancelled)      adjustDisabledReason = 'Cannot adjust price for a cancelled order.'
  else if (isCompleted) adjustDisabledReason = 'Cannot adjust price for a completed order.'

  const canAdjust = !adjustDisabledReason

  // Newest-first for admin readability.
  const adjustmentsNewestFirst = [...(priceAdjustments ?? [])].sort(
    (a, b) => new Date(b.creationTime).getTime() - new Date(a.creationTime).getTime(),
  )

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">Payment</h2>
        <span
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-normal tracking-[0.02em]',
            statusCfg.bg,
            statusCfg.text,
          )}
        >
          <span className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', statusCfg.dot)} />
          {statusCfg.label}
        </span>
      </CardHeader>

      <CardBody className="space-y-4">

        {/* Requirement type */}
        <div>
          <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
            {isDeposit ? 'Deposit + Balance' : 'Full Payment Required'}
          </p>
          <p className="text-xs text-black/45" style={{ letterSpacing: '-0.14px' }}>
            {isDeposit
              ? 'Deposit required before activation. Balance due at pickup.'
              : 'Full payment is required before activation.'}
          </p>
        </div>

        {/* Amount summary */}
        <div className="space-y-2 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Order Total</span>
              {hasPriceAdjustment && (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.4px] text-amber-700">
                  Adjusted
                </span>
              )}
            </div>
            <span className="text-sm text-black/70" style={{ letterSpacing: '-0.14px' }}>
              {formatMoney(order.totalAmount)}
            </span>
          </div>
          {isDeposit && requiredDepositAmount != null && (
            <AmountRow label="Required Deposit" value={formatMoney(requiredDepositAmount)} />
          )}
          <AmountRow label="Commercial Paid Amount" value={formatMoney(paidAmount)} />
          <div className="border-t border-black/[0.06] pt-2">
            <AmountRow label="Commercial Balance Due" value={formatMoney(balanceAmount)} highlight />
          </div>
        </div>

        {/* Status banners */}
        {isDeposit ? (
          requiredDepositAmount != null && paidAmount < requiredDepositAmount ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800" style={{ letterSpacing: '-0.14px' }}>
              Deposit has not been fully received. This order should not be activated yet.
            </div>
          ) : balanceAmount > 0 ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800" style={{ letterSpacing: '-0.14px' }}>
              Deposit received. Balance is due at pickup.
            </div>
          ) : (
            <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-800" style={{ letterSpacing: '-0.14px' }}>
              Order is fully paid.
            </div>
          )
        ) : (
          balanceAmount > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800" style={{ letterSpacing: '-0.14px' }}>
              Full payment is required before this order is activated.
            </div>
          ) : (
            <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-800" style={{ letterSpacing: '-0.14px' }}>
              Order is fully paid.
            </div>
          )
        )}

        {/* Dates + last payment snapshot */}
        {(depositPaidAt || fullyPaidAt || lastPaymentMethod) && (
          <div className="space-y-2">
            {depositPaidAt && (
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Deposit Paid At</span>
                <span className="text-xs text-black/60" style={{ letterSpacing: '-0.14px' }}>{formatDate(depositPaidAt)}</span>
              </div>
            )}
            {fullyPaidAt && (
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Fully Paid At</span>
                <span className="text-xs text-black/60" style={{ letterSpacing: '-0.14px' }}>{formatDate(fullyPaidAt)}</span>
              </div>
            )}
            {lastPaymentMethod && (
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Last Payment</span>
                <span className="text-xs text-black/60" style={{ letterSpacing: '-0.14px' }}>{METHOD_LABELS[lastPaymentMethod]}</span>
              </div>
            )}
            {lastPaymentReference && (
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40 shrink-0">Reference</span>
                <span className="truncate text-right text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>{lastPaymentReference}</span>
              </div>
            )}
            {lastPaymentNote && (
              <div>
                <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Note</span>
                <p className="mt-0.5 text-xs leading-relaxed text-black/55" style={{ letterSpacing: '-0.14px' }}>{lastPaymentNote}</p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-black/[0.06] pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={canRecord ? 'black' : 'glass'}
              disabled={!canRecord}
              onClick={onRecordPayment}
            >
              Record Payment
            </Button>
            <Button
              size="sm"
              variant="glass"
              disabled={!canAdjust}
              onClick={onAdjustPrice}
              title={adjustDisabledReason ?? undefined}
            >
              Adjust Price
            </Button>
          </div>
          {recordDisabledReason && (
            <p className="mt-1.5 text-xs text-black/40" style={{ letterSpacing: '-0.14px' }}>{recordDisabledReason}</p>
          )}
          {adjustDisabledReason && !recordDisabledReason && (
            <p className="mt-1.5 text-xs text-black/40" style={{ letterSpacing: '-0.14px' }}>{adjustDisabledReason}</p>
          )}
        </div>

        {/* Payment history */}
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Payment History</p>
          {paymentTransactions.length === 0 ? (
            <p className="text-xs text-black/40" style={{ letterSpacing: '-0.14px' }}>No payments recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {[...paymentTransactions].reverse().map((txn) => (
                <div
                  key={txn.id}
                  className="space-y-1 rounded-xl border border-black/[0.06] bg-white px-3 py-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.14px' }}>
                      {formatMoney(txn.amount)}
                    </span>
                    <span className="rounded-full border border-black/[0.08] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/50">
                      {METHOD_LABELS[txn.method]}
                    </span>
                  </div>
                  <p className="text-[11px] text-black/45">Commercial payment transaction</p>
                  <p className="font-mono text-[10px] text-black/35 tracking-[0.02em]">
                    {formatDate(txn.creationTime)}
                  </p>
                  {txn.reference && (
                    <p className="text-xs text-black/50" style={{ letterSpacing: '-0.14px' }}>
                      Ref: {txn.reference}
                    </p>
                  )}
                  {txn.note && (
                    <p className="text-xs leading-relaxed text-black/45" style={{ letterSpacing: '-0.14px' }}>
                      {txn.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-black/[0.06] pt-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Online Payment Attempts</p>
          {onlinePaymentSessions.length === 0 ? (
            <p className="text-xs text-black/40">No online payment attempts have been created for this order.</p>
          ) : (
            <div className="space-y-3">
              {onlinePaymentSessions.map((attempt, index) => (
                <AdminOnlinePaymentSessionCard key={attempt.id} attempt={attempt} latest={index === 0} />
              ))}
            </div>
          )}
        </div>

        {/* Price adjustment history */}
        {adjustmentsNewestFirst.length > 0 && (
          <div className="border-t border-black/[0.06] pt-4">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Price Adjustments</p>
            <div className="space-y-2">
              {adjustmentsNewestFirst.map((adj) => (
                <div
                  key={adj.id}
                  className="space-y-1 rounded-xl border border-black/[0.06] bg-white px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-black/70" style={{ letterSpacing: '-0.14px' }}>
                      {formatMoney(adj.oldTotalAmount)} → {formatMoney(adj.newTotalAmount)}
                    </span>
                    <span
                      className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.4px]"
                      style={
                        adj.adjustmentAmount >= 0
                          ? { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', color: '#15803d' }
                          : { borderColor: '#fecaca', backgroundColor: '#fef2f2', color: '#b91c1c' }
                      }
                    >
                      {formatSignedMoney(adj.adjustmentAmount)}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-black/35 tracking-[0.02em]">
                    {formatDate(adj.creationTime)}
                    {adj.adjustedByUser ? ` · ${adj.adjustedByUser}` : ''}
                  </p>
                  {adj.reason && (
                    <p className="text-xs leading-relaxed text-black/55" style={{ letterSpacing: '-0.14px' }}>
                      {adj.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </CardBody>
    </Card>
  )
}
