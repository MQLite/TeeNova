'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { makeAdminUsersApi } from '@/api/admin-users'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import type { AdminUser } from '@/types'

const usersApi = makeAdminUsersApi(adminApiClient)

const inputCls = 'w-full rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:border-black/30 focus:outline-none'
const labelCls = 'block mb-1.5 text-sm text-black/70'

interface Props {
  user: AdminUser
}

export function EditUserForm({ user }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [displayName, setDisplayName] = useState(user.displayName ?? '')
  const [role, setRole] = useState(user.role)
  const [isActive, setIsActive] = useState(user.isActive)
  const [newPassword, setNewPassword] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await usersApi.update(user.id, {
        displayName: displayName.trim() || null,
        role,
        isActive,
        newPassword: newPassword.trim() || null,
      })
      router.push('/admin/users')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
      setError(err instanceof Error ? err.message : 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setError(null)
    setDeleting(true)
    try {
      await usersApi.delete(user.id)
      router.push('/admin/users')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
      setError(err instanceof Error ? err.message : 'Failed to delete user.')
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
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
          Edit User
        </h1>
        <p className="mt-1 font-mono text-xs text-black/45">{user.username}</p>
      </div>

      <form onSubmit={handleSave} className="max-w-lg">
        <div className="space-y-5 rounded-xl border border-black/[0.08] bg-white p-6">
          <div>
            <label className={labelCls}>Username</label>
            <input
              type="text"
              className={`${inputCls} bg-black/[0.02] text-black/45`}
              value={user.username}
              disabled
              readOnly
            />
          </div>

          <div>
            <label className={labelCls}>Display Name</label>
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

          <div className="flex items-center justify-between rounded-lg border border-black/[0.08] px-4 py-3">
            <div>
              <p className="text-sm text-black/70" style={{ letterSpacing: '-0.14px' }}>Active</p>
              <p className="mt-0.5 text-xs text-black/40">Inactive users cannot log in.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setIsActive(v => !v)}
              className={[
                'relative h-6 w-11 rounded-full transition-colors',
                isActive ? 'bg-black' : 'bg-black/20',
              ].join(' ')}
            >
              <span className={[
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                isActive ? 'translate-x-5' : 'translate-x-0.5',
              ].join(' ')} />
            </button>
          </div>

          <div>
            <label className={labelCls}>New Password <span className="text-black/40">(leave blank to keep current)</span></label>
            <input
              type="password"
              className={inputCls}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              minLength={newPassword ? 8 : undefined}
              maxLength={128}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded-full border border-red-200 px-4 py-2 text-sm text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
                style={{ letterSpacing: '-0.14px' }}
              >
                Delete User
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>Are you sure?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm text-white transition-opacity hover:opacity-85 disabled:opacity-40"
                  style={{ letterSpacing: '-0.14px' }}
                >
                  {deleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-full border border-black/[0.12] px-4 py-2 text-sm text-black/55 transition-colors hover:text-black"
                  style={{ letterSpacing: '-0.14px' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
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
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
