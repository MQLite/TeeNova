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
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
        <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>

      {isConnectionRefused ? (
        <>
          <p className="text-base text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
            Backend not reachable
          </p>
          <p className="mt-1 max-w-sm text-sm text-black/50" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
            The API server at{' '}
            <code className="rounded border border-black/[0.10] bg-black/[0.03] px-1.5 py-0.5 font-mono text-[11px] tracking-[0.54px]">
              localhost:44300
            </code>{' '}
            is not running. Start the backend, then try again.
          </p>
          <div className="mt-4 w-full max-w-sm rounded-lg border border-black/[0.08] bg-black/[0.02] px-4 py-3 text-left">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45"># Start the backend</p>
            <p className="font-mono text-xs text-black/60">cd backend/src/TeeNova.HttpApi.Host</p>
            <p className="font-mono text-xs text-black/60">dotnet run</p>
          </div>
        </>
      ) : (
        <>
          <p className="text-base text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
            Something went wrong
          </p>
          <p className="mt-1 max-w-sm text-sm text-black/50" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
            {error.message || 'An unexpected error occurred loading this page.'}
          </p>
        </>
      )}

      <button
        onClick={reset}
        className="btn-black btn-sm mt-6"
      >
        Try again
      </button>
    </div>
  )
}
