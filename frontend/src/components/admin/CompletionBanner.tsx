'use client'

interface Props {
  orderNumber: string
  completedAt?: string
}

export function CompletionBanner({ orderNumber, completedAt }: Props) {
  const formattedDate = completedAt
    ? new Date(completedAt).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })
    : null

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-start gap-3.5">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-5 w-5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
        </div>
        <div>
          <p className="text-sm text-emerald-800" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
            Order Completed
          </p>
          <p className="mt-0.5 text-xs text-emerald-600" style={{ letterSpacing: '-0.14px' }}>
            {orderNumber} has been handed over and finalised.
            {formattedDate && ` Completed on ${formattedDate}.`}
          </p>
        </div>
      </div>
    </div>
  )
}
