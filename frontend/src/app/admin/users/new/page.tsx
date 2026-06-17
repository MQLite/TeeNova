'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { makeAdminUsersApi } from '@/api/admin-users'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'

const usersApi = makeAdminUsersApi(adminApiClient)

const inputCls = 'w-full rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:border-black/30 focus:outline-none'
const labelCls = 'block mb-1.5 text-sm text-black/70'

export default function NewUserPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('Admin')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await usersApi.create({
        username: username.trim(),
        password,
        role,
        displayName: displayName.trim() || null,
      })
      router.push('/admin/users')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
      setError(err instanceof Error ? err.message : 'Failed to create user.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page admin-stack">
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55 transition-colors hover:text-black"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Users
        </Link>
      </div>

      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Admin Users</p>
        <h1 className="mt-1 text-2xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
          New User
        </h1>
        <p className="mt-1 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
          Create a new admin panel account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg">
        <div className="space-y-5 rounded-xl border border-black/[0.08] bg-white p-6">
          <div>
            <label className={labelCls}>Username <span className="text-black/40">(required)</span></label>
            <input
              type="text"
              className={inputCls}
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. jane"
              maxLength={50}
              required
              minLength={3}
              autoComplete="off"
            />
          </div>

          <div>
            <label className={labelCls}>Password <span className="text-black/40">(required, min 8 characters)</span></label>
            <input
              type="password"
              className={inputCls}
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={8}
              maxLength={128}
              required
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className={labelCls}>Display Name <span className="text-black/40">(optional)</span></label>
            <input
              type="text"
              className={inputCls}
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. Jane Smith"
              maxLength={100}
            />
          </div>

          <div>
            <label className={labelCls}>Role</label>
            <select
              className={inputCls}
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value="Admin">Admin — full access</option>
              <option value="Viewer">Viewer — read-only access</option>
            </select>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <Link
            href="/admin/users"
            className="rounded-full border border-black/[0.12] px-5 py-2 text-sm text-black/55 transition-colors hover:text-black"
            style={{ letterSpacing: '-0.14px' }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-black px-6 py-2 text-sm text-white transition-opacity hover:opacity-85 disabled:opacity-40"
            style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
          >
            {saving ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </form>
    </div>
  )
}
