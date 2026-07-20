'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ADMIN_LOG_PAGE_SIZES,
  type AdminLogListResult,
  type AdminLogsErrorKind,
  type AdminLogSortDirection,
  type AdminLogSortField,
  AdminLogsClientError,
  listAdminLogs,
} from '@/api/admin-logs'
import { redirectToLogin } from '@/lib/admin-client'
import {
  ADMIN_LOG_DOWNLOAD_MESSAGES,
  normalizeAdminLogDownloadError,
} from '@/lib/admin-log-download'
import { formatNzDateTime } from '@/lib/datetime'
import { fileSizeLabel } from '@/lib/file-utils'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { DownloadLogButton } from '@/components/admin/DownloadLogButton'
import { EmptyState } from '@/components/admin/EmptyState'
import { SkeletonTable } from '@/components/admin/LoadingSkeleton'

interface LogsPageClientProps {
  initialDownloadError?: string
}

export default function LogsPageClient({ initialDownloadError }: LogsPageClientProps) {
  const router = useRouter()
  const [source, setSource] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortBy, setSortBy] = useState<AdminLogSortField>('lastModifiedUtc')
  const [sortDirection, setSortDirection] = useState<AdminLogSortDirection>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof ADMIN_LOG_PAGE_SIZES)[number]>(25)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [result, setResult] = useState<AdminLogListResult>()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<AdminLogsErrorKind>()
  const [downloadMessage, setDownloadMessage] = useState<string>()
  const hasLoaded = useRef(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const safeError = normalizeAdminLogDownloadError(initialDownloadError)
    if (!safeError) return
    if (safeError === 'session-expired') {
      redirectToLogin('session-expired')
      return
    }
    setDownloadMessage(ADMIN_LOG_DOWNLOAD_MESSAGES[safeError])
    router.replace('/admin/system/logs', { scroll: false })
  }, [initialDownloadError, router])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setError(undefined)
    if (hasLoaded.current) setRefreshing(true)
    else setLoading(true)

    void listAdminLogs(
      { source, search: debouncedSearch, sortBy, sortDirection, page, pageSize },
      undefined,
      controller.signal,
    ).then(data => {
      if (!active) return
      const lastPage = Math.max(1, Math.ceil(data.totalCount / data.pageSize))
      if (data.items.length === 0 && page > lastPage) {
        setPage(lastPage)
        return
      }
      setResult(data)
    }).catch(caught => {
      if (!active || (caught instanceof DOMException && caught.name === 'AbortError')) return
      if (caught instanceof AdminLogsClientError) {
        if (caught.kind === 'session-expired') {
          redirectToLogin('session-expired')
          return
        }
        setError(caught.kind)
      } else {
        setError('failed')
      }
    }).finally(() => {
      if (!active) return
      hasLoaded.current = true
      setLoading(false)
      setRefreshing(false)
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [source, debouncedSearch, sortBy, sortDirection, page, pageSize, refreshVersion])

  const sourceNames = useMemo(
    () => new Map(result?.sources.map(item => [item.key, item.displayName]) ?? []),
    [result?.sources],
  )
  const hasFilters = Boolean(source || debouncedSearch)
  const canGoNext = Boolean(result && page * result.pageSize < result.totalCount)

  function refresh() {
    setDownloadMessage(undefined)
    setRefreshVersion(value => value + 1)
  }

  return (
    <div className="admin-page admin-stack">
      <AdminPageHeader
        title="Server Logs"
        subtitle="View and download application log files from configured TeeNova log sources."
        action={
          <button
            type="button"
            onClick={refresh}
            disabled={loading || refreshing}
            className="rounded-full border border-black/[0.12] bg-white px-4 py-2 text-sm text-black/65 transition-colors hover:border-black/30 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      {downloadMessage && (
        <SafeBanner tone="warning" onDismiss={() => setDownloadMessage(undefined)}>
          {downloadMessage}
        </SafeBanner>
      )}

      <section aria-label="Log filters" className="grid gap-4 rounded-xl border border-black/[0.08] bg-white p-5 md:grid-cols-2 xl:grid-cols-5">
        <FilterField label="Source">
          <select
            value={source}
            onChange={event => { setSource(event.target.value); setPage(1) }}
            className={controlClasses}
          >
            <option value="">All available sources</option>
            {result?.sources.map(item => (
              <option key={item.key} value={item.key}>
                {item.displayName}{item.available ? '' : ' (Unavailable)'}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Filename search">
          <input
            type="search"
            value={search}
            maxLength={200}
            placeholder="Search filenames"
            onChange={event => { setSearch(event.target.value); setPage(1) }}
            className={controlClasses}
          />
        </FilterField>

        <FilterField label="Sort field">
          <select
            value={sortBy}
            onChange={event => { setSortBy(event.target.value as AdminLogSortField); setPage(1) }}
            className={controlClasses}
          >
            <option value="lastModifiedUtc">Last modified</option>
            <option value="fileName">File name</option>
            <option value="source">Source</option>
            <option value="sizeBytes">File size</option>
          </select>
        </FilterField>

        <FilterField label="Sort direction">
          <select
            value={sortDirection}
            onChange={event => { setSortDirection(event.target.value as AdminLogSortDirection); setPage(1) }}
            className={controlClasses}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </FilterField>

        <FilterField label="Page size">
          <select
            value={pageSize}
            onChange={event => {
              setPageSize(Number(event.target.value) as (typeof ADMIN_LOG_PAGE_SIZES)[number])
              setPage(1)
            }}
            className={controlClasses}
          >
            {ADMIN_LOG_PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </FilterField>
      </section>

      {loading ? (
        <div aria-live="polite" aria-busy="true"><SkeletonTable rows={6} cols={5} /></div>
      ) : error ? (
        <ListingError kind={error} onRetry={refresh} />
      ) : (
        <>
          {result?.warnings.map(warning => (
            <SafeBanner key={`${warning.sourceKey}-${warning.code}`} tone="warning">
              {sourceNames.get(warning.sourceKey) ?? warning.sourceKey} is temporarily unavailable.
            </SafeBanner>
          ))}

          {result?.isTruncated && (
            <SafeBanner tone="info">
              The log list was limited by the server. Refine your search or select a specific source.
            </SafeBanner>
          )}

          {!result || result.items.length === 0 ? (
            <EmptyState
              title={hasFilters ? 'No log files match the current filters.' : 'No log files are available.'}
              description={hasFilters ? 'Adjust the source or filename search and try again.' : undefined}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="border-b border-black/[0.06] bg-black/[0.02]">
                    <tr>
                      <TableHeading>File name</TableHeading>
                      <TableHeading>Source</TableHeading>
                      <TableHeading>File size</TableHeading>
                      <TableHeading>Last modified</TableHeading>
                      <TableHeading align="right">Action</TableHeading>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map(item => (
                      <tr key={`${item.sourceKey}-${item.fileName}`} className="border-b border-black/[0.05] last:border-0 hover:bg-black/[0.015]">
                        <td className="px-5 py-3.5 font-mono text-xs text-black/75">{item.fileName}</td>
                        <td className="px-5 py-3.5 text-black/60">{item.sourceName}</td>
                        <td className="px-5 py-3.5 tabular-nums text-black/60">{fileSizeLabel(item.sizeBytes)}</td>
                        <td className="px-5 py-3.5 text-black/60">{formatNzDateTime(item.lastModifiedUtc)}</td>
                        <td className="px-5 py-3.5 text-right">
                          <DownloadLogButton
                            fileId={item.id}
                            fileName={item.fileName}
                            disabled={!item.downloadable}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] px-5 py-3.5">
                <p className="text-xs text-black/50">
                  Page {result.page} · {result.totalCount} {result.isTruncated ? 'files in the inspected set' : 'files total'}
                </p>
                <div className="flex gap-2">
                  <PaginationButton disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>
                    Previous
                  </PaginationButton>
                  <PaginationButton disabled={!canGoNext} onClick={() => setPage(value => value + 1)}>
                    Next
                  </PaginationButton>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ListingError({ kind, onRetry }: { kind: AdminLogsErrorKind; onRetry: () => void }) {
  if (kind === 'forbidden') {
    return <SafeBanner tone="warning">You need the Admin role to view server logs.</SafeBanner>
  }
  if (kind === 'feature-disabled') {
    return <StateWithRetry message="Server log downloads are currently disabled." onRetry={onRetry} />
  }
  if (kind === 'source-unavailable') {
    return <StateWithRetry message="The selected server log source is temporarily unavailable." onRetry={onRetry} />
  }
  if (kind === 'invalid-query') {
    return <StateWithRetry message="The current log filters are not supported. Reset the filters and try again." onRetry={onRetry} />
  }
  return <StateWithRetry message="Server logs could not be loaded. Please try again." onRetry={onRetry} />
}

function StateWithRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
      <p>{message}</p>
      <button type="button" onClick={onRetry} className="mt-3 rounded-full border border-red-300 px-4 py-1.5 text-xs font-medium hover:bg-red-100">
        Retry
      </button>
    </div>
  )
}

function SafeBanner({
  children,
  tone,
  onDismiss,
}: {
  children: React.ReactNode
  tone: 'warning' | 'info'
  onDismiss?: () => void
}) {
  return (
    <div
      role={tone === 'warning' ? 'alert' : 'status'}
      className={[
        'flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm',
        tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-sky-200 bg-sky-50 text-sky-800',
      ].join(' ')}
    >
      <span>{children}</span>
      {onDismiss && <button type="button" onClick={onDismiss} className="text-xs font-medium underline">Dismiss</button>}
    </div>
  )
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.45px] text-black/50">{label}</span>
      {children}
    </label>
  )
}

function TableHeading({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th scope="col" className={`px-5 py-3 ${align === 'right' ? 'text-right' : 'text-left'} font-mono text-[10px] uppercase tracking-[0.45px] text-black/45`}>{children}</th>
}

function PaginationButton({ children, disabled, onClick }: { children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-full border border-black/[0.12] px-3 py-1.5 text-xs text-black/60 hover:border-black/30 hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  )
}

const controlClasses = 'h-10 w-full rounded-lg border border-black/[0.12] bg-white px-3 text-sm text-black/75 outline-none transition focus:border-black/35 focus:ring-2 focus:ring-black/[0.06]'
