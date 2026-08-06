import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AdminShell } from './AdminShell'
import { getAdminUsername, getAdminRole } from '@/lib/auth'
import { brandName } from '@/lib/site-brand'

/**
 * Admin metadata.
 *
 * `noindex, nofollow` on the whole subtree (Jira 10308). Authorization is what protects Admin — the
 * middleware redirects an unauthenticated request and the backend rejects an unauthorized one — so
 * this is discovery hygiene rather than a security control, and it is applied in addition to the
 * `Disallow: /admin/` line in `robots.txt`, not instead of it.
 */
export const metadata: Metadata = {
  title: { template: `%s | Admin - ${brandName}`, default: `Admin - ${brandName}` },
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const username = getAdminUsername() ?? undefined
  const role = getAdminRole() ?? undefined
  return <AdminShell username={username} role={role}>{children}</AdminShell>
}
