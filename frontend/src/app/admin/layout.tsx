import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AdminShell } from './AdminShell'
import { getAdminUsername } from '@/lib/auth'

export const metadata: Metadata = {
  title: { template: '%s | Admin - Otahuhu Printing', default: 'Admin - Otahuhu Printing' },
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const username = getAdminUsername() ?? undefined
  return <AdminShell username={username}>{children}</AdminShell>
}
