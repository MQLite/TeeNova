'use client'

import { useState } from 'react'

interface Props {
  returnUrl: string
  sessionExpired?: boolean
}

export function LoginForm({ returnUrl, sessionExpired }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null) as { message?: string } | null
        setError(data?.message ?? 'Invalid username or password.')
        setLoading(false)
        return
      }

      // Cookie is now set server-side. Hard-navigate to bypass Next.js router cache,
      // which may still hold a stale redirect entry for the target page.
      window.location.href = returnUrl
    } catch {
      setError('Unable to connect. Please try again.')
      setLoading(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-black/[0.12] bg-white px-3 py-2.5 text-sm ' +
    'text-black placeholder:text-black/30 focus:border-black/30 focus:outline-none ' +
    'disabled:opacity-50'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-4">
      <div className="w-full max-w-sm">

        {/* Brand mark */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black shadow-sm">
            <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5">
              <path d="M6 2L2 6l3 2v12h14V8l3-2-4-4s-1 2-4 2-4-2-4-2H6z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-base text-black" style={{ fontWeight: 540, letterSpacing: '-0.42px' }}>
              Otahuhu Printing
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">
              Admin workspace
            </p>
          </div>
        </div>

        {/* Session-expired notice — shown when token was rejected by the backend */}
        {sessionExpired && (
          <div
            role="status"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
            style={{ letterSpacing: '-0.14px' }}
          >
            Your session has expired. Please log in again.
          </div>
        )}

        {/* Login card */}
        <div className="rounded-2xl border border-black/[0.08] bg-white px-6 py-6 shadow-sm">
          <p className="mb-5 text-sm text-black/60" style={{ letterSpacing: '-0.14px' }}>
            Sign in to continue
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="mb-1.5 block text-sm text-black/70"
                style={{ letterSpacing: '-0.14px' }}
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className={inputCls}
                placeholder="admin"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm text-black/70"
                style={{ letterSpacing: '-0.14px' }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={inputCls}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                style={{ letterSpacing: '-0.14px' }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full rounded-full bg-black py-2.5 text-sm text-white transition-opacity hover:opacity-85 disabled:opacity-40"
              style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center font-mono text-[10px] uppercase tracking-[0.54px] text-black/30">
          Internal staff access only
        </p>
      </div>
    </div>
  )
}
