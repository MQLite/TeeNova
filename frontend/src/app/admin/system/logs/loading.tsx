import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { SkeletonTable } from '@/components/admin/LoadingSkeleton'

export default function ServerLogsLoading() {
  return (
    <div className="admin-page admin-stack" aria-busy="true" aria-label="Loading server logs">
      <AdminPageHeader
        title="Server Logs"
        subtitle="View and download application log files from configured TeeNova log sources."
      />
      <SkeletonTable rows={6} cols={5} />
    </div>
  )
}
