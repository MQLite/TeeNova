'use client'

import { useEffect, useState } from 'react'
import {
  getAiOrderOperationsStatus,
  type AiOrderOperationsStatus,
} from '@/api/ai-order-imports'

const featureLabels: Array<[keyof AiOrderOperationsStatus['features'], string]> = [
  ['enabled', 'Overall feature'],
  ['intakeEnabled', 'Intake'],
  ['recognitionEnabled', 'Recognition'],
  ['reviewEnabled', 'Staff review'],
  ['confirmationEnabled', 'Confirmation'],
  ['materializationEnabled', 'Materialization'],
]

function Status({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full border border-black/[0.12] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.4px] text-black/65">
      {value}
    </span>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-black/[0.035] p-3">
      <dt className="text-xs text-black/50">{label}</dt>
      <dd className="mt-1 text-lg text-black" style={{ fontWeight: 540 }}>{value}</dd>
    </div>
  )
}

export function AiOrderOperationsClient() {
  const [status, setStatus] = useState<AiOrderOperationsStatus>()
  const [error, setError] = useState<string>()

  function refresh() {
    setError(undefined)
    getAiOrderOperationsStatus()
      .then(setStatus)
      .catch((reason: Error) => setError(reason.message))
  }

  useEffect(refresh, [])

  return (
    <main className="admin-page admin-stack">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
            Security and operations
          </p>
          <h1 className="mt-1 text-2xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
            AI Order Operations
          </h1>
          <p className="mt-1 text-sm text-black/55">
            Safe readiness, privacy, budget, queue, and retention status. Secrets and storage paths are never shown.
          </p>
        </div>
        <button type="button" onClick={refresh} className="rounded-full border border-black/[0.14] px-4 py-2 text-sm">
          Refresh status
        </button>
      </div>

      {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {!status && !error && <p className="text-sm text-black/50">Loading operational status…</p>}

      {status && (
        <>
          <section className="card p-4 sm:p-5" aria-labelledby="overall-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="overall-heading" className="text-base text-black" style={{ fontWeight: 540 }}>
                  Environment: {status.environment}
                </h2>
                <p className="mt-1 text-xs text-black/50">
                  Generated {new Date(status.generatedAt).toLocaleString('en-NZ')}
                </p>
              </div>
              <Status value={status.overallStatus} />
            </div>
            {(status.blockers.length > 0 || status.warnings.length > 0) && (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div>
                  <h3 className="text-xs uppercase tracking-wide text-black/55">Blockers</h3>
                  {status.blockers.length === 0 ? <p className="mt-2 text-sm text-black/50">None</p> : (
                    <ul className="mt-2 space-y-1 text-sm text-red-800">
                      {status.blockers.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-wide text-black/55">Warnings</h3>
                  {status.warnings.length === 0 ? <p className="mt-2 text-sm text-black/50">None</p> : (
                    <ul className="mt-2 space-y-1 text-sm text-amber-900">
                      {status.warnings.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="card p-4 sm:p-5" aria-labelledby="features-heading">
            <h2 id="features-heading" className="text-base text-black" style={{ fontWeight: 540 }}>Feature status</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {featureLabels.map(([key, label]) => (
                <div key={key} className="flex items-center justify-between rounded-xl border border-black/[0.08] p-3">
                  <span className="text-sm text-black/65">{label}</span>
                  <Status value={status.features[key] ? 'Enabled' : 'Disabled'} />
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4 sm:p-5">
              <h2 className="text-base text-black" style={{ fontWeight: 540 }}>Database and private storage</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3"><dt>Migration readiness</dt><dd><Status value={status.migrations.status} /></dd></div>
                <div className="flex items-center justify-between gap-3"><dt>Runtime schema current</dt><dd>{status.migrations.runtimeSchemaCurrent ? 'Yes' : 'No'}</dd></div>
                <div className="flex items-center justify-between gap-3"><dt>Private storage</dt><dd><Status value={status.privateStorageStatus} /></dd></div>
                <div className="flex items-center justify-between gap-3"><dt>Free-space probe</dt><dd>{status.privateStorageAvailableBytes == null ? 'Unavailable' : `${(status.privateStorageAvailableBytes / 1024 ** 3).toFixed(1)} GiB`}</dd></div>
              </dl>
            </div>
            <div className="card p-4 sm:p-5">
              <h2 className="text-base text-black" style={{ fontWeight: 540 }}>Queue and retention</h2>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <Metric label="Queued jobs" value={status.queuedRecognitionJobs} />
                <Metric label="Active leases" value={status.activeRecognitionLeases} />
                <Metric label="Expired/stuck" value={status.expiredOrStuckLeases} />
                <Metric label="Retryable failures" value={status.retryableFailures} />
                <Metric label="Deletion backlog" value={status.deletionBacklog} />
                <Metric label="Failed deletions" value={status.failedDeletionCount} />
                <Metric label="Active holds" value={status.activeRetentionHolds} />
                <Metric label="Source access (24h)" value={status.sourceAccessesLast24Hours} />
                <Metric label="Denied access (24h)" value={status.deniedSourceAccessesLast24Hours} />
                <Metric label="Last cleanup" value={status.lastRetentionWorkerOutcome ?? 'Not run'} />
              </dl>
            </div>
          </section>

          <section className="card overflow-hidden" aria-labelledby="providers-heading">
            <div className="border-b border-black/[0.08] p-4 sm:p-5">
              <h2 id="providers-heading" className="text-base text-black" style={{ fontWeight: 540 }}>AI providers and privacy approval</h2>
              <p className="mt-1 text-xs text-black/50">Configuration is read-only. Rotate keys in the approved server-side secret store.</p>
            </div>
            <div className="divide-y divide-black/[0.07]">
              {status.providers.map((provider) => (
                <article key={provider.provider} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm text-black" style={{ fontWeight: 540 }}>{provider.displayName}</h3>
                      <p className="mt-1 text-xs text-black/50">{provider.provider} · {provider.enabledModels.length} enabled model(s)</p>
                    </div>
                    <Status value={provider.status} />
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs text-black/60 sm:grid-cols-2 lg:grid-cols-4">
                    <div><dt>Privacy</dt><dd className="mt-0.5 text-black">{provider.privacyApprovalStatus}</dd></div>
                    <div><dt>Approved environment</dt><dd className="mt-0.5 text-black">{provider.approvedEnvironment || 'Not set'}</dd></div>
                    <div><dt>Daily calls</dt><dd className="mt-0.5 text-black">{provider.maximumDailyCalls}</dd></div>
                    <div><dt>Monthly budget</dt><dd className="mt-0.5 text-black">${provider.maximumMonthlyCostUsd.toFixed(2)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section className="card p-4 sm:p-5" aria-labelledby="budget-heading">
            <h2 id="budget-heading" className="text-base text-black" style={{ fontWeight: 540 }}>Usage and budget</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric label="Provider calls this month" value={status.currentMonthProviderCalls} />
              <Metric label="Estimated cost" value={`$${status.currentMonthEstimatedCostUsd.toFixed(2)}`} />
              <Metric label="Actual cost" value={`$${status.currentMonthActualCostUsd.toFixed(2)}`} />
              <Metric label="Total monthly limit" value={`$${status.maximumMonthlyTotalCostUsd.toFixed(2)}`} />
            </dl>
          </section>
        </>
      )}
    </main>
  )
}
