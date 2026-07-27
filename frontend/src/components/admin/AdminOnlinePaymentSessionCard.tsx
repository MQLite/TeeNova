import { formatNzDateTime } from '@/lib/datetime'
import { formatPaymentAmount } from '@/lib/money'
import { formatBasisPointsForDisplay } from '@/lib/payment-display'
import type { AdminOnlinePaymentSession } from '@/types'

const reconciliationTone = {
  Reconciled: 'border-green-200 bg-green-50 text-green-700',
  Pending: 'border-blue-200 bg-blue-50 text-blue-700',
  RequiresReview: 'border-amber-300 bg-amber-50 text-amber-800',
  Failed: 'border-red-200 bg-red-50 text-red-700',
  Cancelled: 'border-black/[0.10] bg-black/[0.03] text-black/55',
  Expired: 'border-black/[0.10] bg-black/[0.03] text-black/55',
} as const

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-xs text-black/50">{label}</dt>
      <dd className="min-w-0 text-right text-xs text-black/70">{children}</dd>
    </div>
  )
}

function Identifier({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <DetailRow label={label}>
      <code title={value} aria-label={`${label}: ${value}`} className="block break-all font-mono text-[11px]">
        {value}
      </code>
    </DetailRow>
  )
}

export function AdminOnlinePaymentSessionCard({
  attempt,
  latest,
}: {
  attempt: AdminOnlinePaymentSession
  latest: boolean
}) {
  const legacy = attempt.surchargeCalculationVersion === 'legacy-no-surcharge'
  const hasSurcharge = attempt.surchargeAmount > 0 && !legacy
  const mode = attempt.providerMode ?? 'Unknown · legacy session'
  const calculation = legacy ? 'Legacy · no surcharge' : attempt.surchargeCalculationVersion

  return (
    <article aria-labelledby={`payment-attempt-${attempt.id}`} className="space-y-4 rounded-2xl border border-black/[0.08] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={`payment-attempt-${attempt.id}`} className="text-sm font-medium text-black/80">
            {attempt.provider} online payment attempt
          </h3>
          <p className="mt-0.5 text-xs text-black/45">
            {formatNzDateTime(attempt.creationTime)}{latest ? ' · Latest attempt' : ''}
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${reconciliationTone[attempt.reconciliationStatus]}`}>
          {attempt.reconciliationStatus === 'RequiresReview' ? 'Requires review' : attempt.reconciliationStatus}
        </span>
      </div>

      {attempt.reconciliationStatus === 'RequiresReview' && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {attempt.reconciliationMessage ?? 'This payment attempt requires operator review.'}
        </div>
      )}

      <dl aria-label="Payment amount breakdown" className="space-y-2 rounded-xl border border-black/[0.06] bg-black/[0.02] p-3">
        <DetailRow label="Commercial payment">{formatPaymentAmount(attempt.baseAmount, attempt.currency)}</DetailRow>
        <DetailRow label="Card surcharge">
          {hasSurcharge ? formatPaymentAmount(attempt.surchargeAmount, attempt.currency) : 'No surcharge'}
        </DetailRow>
        <div className="border-t border-black/[0.08] pt-2">
          <DetailRow label="Total collected">{formatPaymentAmount(attempt.chargedAmount, attempt.currency)}</DetailRow>
        </div>
      </dl>

      <div className="grid gap-4 sm:grid-cols-2">
        <dl className="space-y-2">
          <DetailRow label="Provider">{attempt.provider}</DetailRow>
          <DetailRow label="Mode">{mode}</DetailRow>
          <DetailRow label="Purpose">{attempt.purpose}</DetailRow>
          <DetailRow label="Session status">{attempt.status}</DetailRow>
          <DetailRow label="Webhook status">{attempt.webhookStatus ?? 'No event recorded'}</DetailRow>
        </dl>
        <dl className="space-y-2">
          <DetailRow label="Rate">{hasSurcharge ? formatBasisPointsForDisplay(attempt.surchargePercentageBasisPoints) : 'No surcharge'}</DetailRow>
          <DetailRow label="Fixed fee">{hasSurcharge ? formatPaymentAmount(attempt.surchargeFixedAmount, attempt.currency) : 'No surcharge'}</DetailRow>
          <DetailRow label="Calculation">{calculation}</DetailRow>
          <DetailRow label="Commercial transaction">
            {attempt.paymentTransactionId ? 'Recorded' : attempt.status === 'Completed' ? 'Missing' : 'Not recorded'}
          </DetailRow>
          {attempt.commercialTransactionAmount != null && (
            <DetailRow label="Commercial amount">
              {formatPaymentAmount(attempt.commercialTransactionAmount, attempt.currency)}
            </DetailRow>
          )}
        </dl>
      </div>

      <details className="rounded-xl border border-black/[0.06] p-3">
        <summary className="cursor-pointer text-xs font-medium text-black/60">Technical identifiers</summary>
        <dl className="mt-3 space-y-2">
          <Identifier label="Local payment session ID" value={attempt.id} />
          <Identifier label={`${attempt.provider} Session ID`} value={attempt.providerSessionId} />
          <Identifier label={`${attempt.provider} Payment ID`} value={attempt.providerPaymentId} />
          <Identifier label="Webhook Event ID" value={attempt.providerEventId} />
          <Identifier label="Commercial transaction ID" value={attempt.paymentTransactionId} />
          {attempt.observedProviderAmount != null && (
            <DetailRow label="Observed provider amount">
              {formatPaymentAmount(attempt.observedProviderAmount, attempt.observedCurrency ?? attempt.currency)}
            </DetailRow>
          )}
          {attempt.observedCurrency && <DetailRow label="Observed currency">{attempt.observedCurrency}</DetailRow>}
          {attempt.reviewReasonCode && <DetailRow label="Review code"><code className="break-all">{attempt.reviewReasonCode}</code></DetailRow>}
          {attempt.rawProviderStatus && <DetailRow label="Provider status"><code className="break-all">{attempt.rawProviderStatus}</code></DetailRow>}
        </dl>
      </details>
    </article>
  )
}
