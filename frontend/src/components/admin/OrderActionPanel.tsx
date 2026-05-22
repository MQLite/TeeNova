'use client'

import { OrderStatusBadge } from '@/components/admin/OrderStatusBadge'
import { Button } from '@/components/ui/Button'
import type { OrderStatus, PaymentRequirementType } from '@/types'

export function PaymentActionButton({
  loading,
  disabled,
  onClick,
}: {
  loading?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Button size="sm" loading={loading} disabled={disabled} onClick={onClick}>
      Activate Order
    </Button>
  )
}

export function ReviewActionButton({
  loading,
  onClick,
}: {
  loading?: boolean
  onClick: () => void
}) {
  return (
    <Button size="sm" loading={loading} onClick={onClick}>
      Start Reviewing
    </Button>
  )
}

export function OrderActionPanel({
  status,
  loading,
  onMarkPaid,
  onStartReview,
  onStartPrinting,
  paymentThresholdMet,
  paymentRequirementType,
}: {
  status: OrderStatus
  loading?: boolean
  onMarkPaid: () => void
  onStartReview: () => void
  onStartPrinting: () => void
  paymentThresholdMet?: boolean
  paymentRequirementType?: PaymentRequirementType
}) {
  const isActivationPhase = status === 'Pending' || status === 'Paid'
  const isReviewPhase = status === 'Reviewing'
  const isPastActivation = !isActivationPhase && !isReviewPhase

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
            Activation
          </p>
          <h2 className="mt-1 text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
            Payment and review status
          </h2>
          <p className="mt-1 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
            Orders move into production after payment confirmation and admin review.
          </p>
        </div>
        <OrderStatusBadge status={status} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/[0.08] pt-4">
        {/* Activation phase */}
        {status === 'Pending' && (
          <div className="flex flex-wrap items-center gap-3">
            <PaymentActionButton
              loading={loading}
              disabled={paymentThresholdMet === false}
              onClick={onMarkPaid}
            />
            {paymentThresholdMet === false && (
              <p className="text-xs text-black/45" style={{ letterSpacing: '-0.14px' }}>
                {paymentRequirementType === 'DepositThenBalance'
                  ? 'Required deposit has not been received yet.'
                  : 'Full payment has not been received yet.'}
              </p>
            )}
          </div>
        )}
        {status === 'Paid' && (
          <>
            <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-green-700">
              Activated
            </span>
            <ReviewActionButton loading={loading} onClick={onStartReview} />
          </>
        )}

        {/* Reviewing — single Start Printing action */}
        {isReviewPhase && (
          <Button size="sm" loading={loading} onClick={onStartPrinting}>
            Start Printing
          </Button>
        )}

        {/* Past activation */}
        {isPastActivation && (
          <span className="rounded-full border border-black/[0.08] bg-black/[0.02] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
            Activation complete
          </span>
        )}
      </div>
    </div>
  )
}
