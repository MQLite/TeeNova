import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import LogsPageClient from './LogsPageClient'

export function ServerLogsPageContent({
  role,
  initialDownloadError,
}: {
  role: string
  initialDownloadError?: string
}) {
  if (role !== 'Admin') {
    return (
      <div className="admin-page admin-stack">
        <AdminPageHeader
          title="Server Logs"
          subtitle="View and download application log files from configured TeeNova log sources."
        />
        <div role="alert" className="max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          You need the Admin role to view and download server logs.
        </div>
      </div>
    )
  }

  return <LogsPageClient initialDownloadError={initialDownloadError} />
}
