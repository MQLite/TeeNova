import type { Metadata } from 'next'
import Link from 'next/link'
import { makeAdminApiClient, getAdminRole } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import type { AdminUser } from '@/types'

export const metadata: Metadata = { title: 'Admin Users' }

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={[
      'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.4px]',
      role === 'Admin'
        ? 'bg-black/[0.06] text-black/70'
        : 'bg-amber-50 text-amber-700 border border-amber-200',
    ].join(' ')}>
      {role}
    </span>
  )
}

export default async function AdminUsersPage() {
  const role = getAdminRole()

  if (role !== 'Admin') {
    return (
      <div className="admin-page admin-stack">
        <AdminPageHeader title="Admin Users" subtitle="Manage admin user accounts." />
        <div className="rounded-xl border border-black/[0.08] bg-white p-8 text-center max-w-md">
          <p className="text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
            You need Admin role to manage users.
          </p>
        </div>
      </div>
    )
  }

  let users: AdminUser[] = []
  let error: string | null = null

  try {
    const client = makeAdminApiClient()
    users = await client.get<AdminUser[]>('/admin-users')
  } catch {
    error = 'Failed to load users.'
  }

  return (
    <div className="admin-page admin-stack">
      <AdminPageHeader
        title="Admin Users"
        subtitle="Manage who can access the admin panel."
        action={
          <Link
            href="/admin/users/new"
            className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2 text-sm text-white transition-opacity hover:opacity-85"
            style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New User
          </Link>
        }
      />

      {error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <div className="rounded-xl border border-black/[0.08] bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/[0.06]">
                <th className="px-5 py-3 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Username</th>
                <th className="px-5 py-3 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Display Name</th>
                <th className="px-5 py-3 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Role</th>
                <th className="px-5 py-3 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Status</th>
                <th className="px-5 py-3 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Last Login</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-black/40">
                    No users found.
                  </td>
                </tr>
              ) : users.map((user) => (
                <tr key={user.id} className="border-b border-black/[0.04] last:border-0 hover:bg-black/[0.02]">
                  <td className="px-5 py-3.5 font-mono text-xs text-black" style={{ letterSpacing: '-0.14px' }}>
                    {user.username}
                  </td>
                  <td className="px-5 py-3.5 text-black/70" style={{ letterSpacing: '-0.14px' }}>
                    {user.displayName ?? <span className="text-black/30">—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={[
                      'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.4px]',
                      user.isActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-black/[0.04] text-black/40',
                    ].join(' ')}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-black/45">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                      : <span className="text-black/25">Never</span>}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href={`/admin/users/${user.id}/edit`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.10] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.4px] text-black/55 transition-colors hover:border-black/25 hover:text-black"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
