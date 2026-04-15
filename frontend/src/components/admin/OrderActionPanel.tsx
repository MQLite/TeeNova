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
  loading,
  onMarkPaid,
  onStartReview,
}: {
  status: OrderStatus
  loading?: boolean
  onMarkPaid: () => void
  onStartReview: () => void
}) {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">Activation</p>
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
        {status === 'Pending' && <PaymentActionButton loading={loading} onClick={onMarkPaid} />}
        {status === 'Paid' && (
          <>
            <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-green-700">
              Paid
            </span>
            <ReviewActionButton loading={loading} onClick={onStartReview} />
          </>
        )}
        {status === 'Reviewing' && (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-blue-700">
            Under Review
          </span>
        )}
        {status !== 'Pending' && status !== 'Paid' && status !== 'Reviewing' && (
          <span className="rounded-full border border-black/[0.08] bg-black/[0.02] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
            Activation complete
          </span>
        )}
      </div>
    </div>
  )
}
