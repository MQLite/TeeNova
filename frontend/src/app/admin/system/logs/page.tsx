import type { Metadata } from 'next'
import { getAdminRole, redirectToExpiredLogin } from '@/lib/auth'
import { normalizeAdminLogDownloadError } from '@/lib/admin-log-download'
import { ServerLogsPageContent } from './ServerLogsPageContent'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Server Logs' }

interface ServerLogsPageProps {
  searchParams?: { downloadError?: string | string[] }
}

export default function ServerLogsPage({ searchParams }: ServerLogsPageProps) {
  const role = getAdminRole()
  if (!role) redirectToExpiredLogin('/admin/system/logs')

  return (
    <ServerLogsPageContent
      role={role}
      initialDownloadError={normalizeAdminLogDownloadError(searchParams?.downloadError)}
    />
  )
}
