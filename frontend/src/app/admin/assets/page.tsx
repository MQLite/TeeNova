import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { EmptyState } from '@/components/admin/EmptyState'
import { filesApi } from '@/api/files'
import { AssetsGrid } from './AssetsGrid'

export const metadata = { title: 'Assets' }
export const dynamic = 'force-dynamic'

export default async function AdminAssetsPage() {
  const result = await filesApi.getAdminAssets()
  const assets = result.items ?? []

  return (
    <div>
      <AdminPageHeader
        title="Assets"
        subtitle={`${assets.length} design file${assets.length !== 1 ? 's' : ''} uploaded by customers.`}
      />

      {assets.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7 text-gray-400">
              <path
                fillRule="evenodd"
                d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                clipRule="evenodd"
              />
            </svg>
          }
          title="No uploaded assets yet"
          description="Design files appear here once customers upload artwork during checkout. Orphaned files are cleaned up automatically."
        />
      ) : (
        <AssetsGrid assets={assets} />
      )}
    </div>
  )
}
