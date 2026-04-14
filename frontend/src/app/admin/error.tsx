'use client'

import { useEffect } from 'react'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AdminError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[Admin error]', error)
  }, [error])

  const isConnectionRefused =
    error.message?.includes('ECONNREFUSED') ||
    error.message?.includes('fetch failed') ||
    error.cause instanceof AggregateError

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
        <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>

      {isConnectionRefused ? (
        <>
          <p className="text-base font-semibold text-gray-900">Backend not reachable</p>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            The API server at <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-700">localhost:44300</code> is not running.
            Start the backend, then try again.
          </p>
          <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-left text-xs font-mono text-gray-500 max-w-sm w-full">
            <p className="text-gray-400 mb-1"># Start the backend</p>
            <p>cd backend/src/TeeNova.HttpApi.Host</p>
            <p>dotnet run</p>
          </div>
        </>
      ) : (
        <>
          <p className="text-base font-semibold text-gray-900">Something went wrong</p>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            {error.message || 'An unexpected error occurred loading this page.'}
          </p>
        </>
      )}

      <button
        onClick={reset}
        className="mt-6 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
