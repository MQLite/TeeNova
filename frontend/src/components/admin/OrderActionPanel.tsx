'use client'

import { OrderStatusBadge } from '@/components/admin/OrderStatusBadge'
import { Button } from '@/components/ui/Button'
import type { OrderStatus } from '@/types'

export function PaymentActionButton({
  loading,
  onClick,
}: {
  loading?: boolean
  onClick: () => void
}) {
  return (
    <Button size="sm" loading={loading} onClick={onClick}>
      Mark as Paid
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
  isApprovedForPrinting,
  loading,
  onMarkPaid,
  onStartReview,
  onApproveForPrinting,
  onStartPrinting,
}: {
  status: OrderStatus
  isApprovedForPrinting: boolean
  loading?: boolean
  onMarkPaid: () => void
  onStartReview: () => void
  onApproveForPrinting: () => void
  onStartPrinting: () => void
}) {
  const isActivationPhase = status === 'Pending' || status === 'Paid'
  const isReviewPhase = status === 'Reviewing'
  const isPastActivation = !isActivationPhase && !isReviewPhase

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
            {isReviewPhase ? 'Print Preparation' : 'Activation'}
          </p>
          <h2 className="mt-1 text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
            {isReviewPhase ? 'Approve and start printing' : 'Payment and review status'}
          </h2>
          <p className="mt-1 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
            {isReviewPhase
              ? 'Review designs, then approve and queue for printing.'
              : 'Orders move into production after payment confirmation and admin review.'}
          </p>
        </div>
        <OrderStatusBadge status={status} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/[0.08] pt-4">
        {/* Activation phase */}
        {status === 'Pending' && (
          <PaymentActionButton loading={loading} onClick={onMarkPaid} />
        )}
        {status === 'Paid' && (
          <>
            <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-green-700">
              Paid
            </span>
            <ReviewActionButton loading={loading} onClick={onStartReview} />
          </>
        )}

        {/* Review / print-approval phase */}
        {isReviewPhase && !isApprovedForPrinting && (
          <Button size="sm" loading={loading} onClick={onApproveForPrinting}>
            Approve for Printing
          </Button>
        )}
        {isReviewPhase && isApprovedForPrinting && (
          <>
            <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-green-700">
              Approved
            </span>
            <Button size="sm" loading={loading} onClick={onStartPrinting}>
              Start Printing
            </Button>
          </>
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
