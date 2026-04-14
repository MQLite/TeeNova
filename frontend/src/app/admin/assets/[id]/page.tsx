import Link from 'next/link'
import { notFound } from 'next/navigation'
import { filesApi } from '@/api/files'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { fileSizeLabel, fileTypeLabel, isPreviewable } from '@/lib/file-utils'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminAssetDetailPage({ params }: Props) {
  const { id } = await params

  let asset
  try {
    asset = await filesApi.getAdminAssetById(id)
  } catch {
    notFound()
  }

  const createdAt = new Date(asset.creationTime).toLocaleString('en-NZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const previewed = isPreviewable(asset.contentType)

  return (
    <div>
      <AdminPageHeader
        title={asset.originalFileName}
        subtitle="Uploaded design file"
        action={
          <Link
            href="/admin/assets"
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:text-gray-800"
          >
            ← Back to Assets
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Preview panel */}
        <div className="flex min-h-[320px] items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
          {previewed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.fileUrl}
              alt={asset.originalFileName}
              className="max-h-[480px] w-full object-contain p-6"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-16 w-16">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              <p className="text-sm font-medium">{fileTypeLabel(asset.contentType)} file</p>
              <p className="text-xs">No preview available</p>
              <a
                href={asset.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:border-gray-300"
              >
                Open file ↗
              </a>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          {/* Metadata card */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">File details</h2>
            <dl className="space-y-2.5 text-sm">
              <MetaRow label="File name" value={asset.originalFileName} />
              <MetaRow label="Type" value={fileTypeLabel(asset.contentType)} />
              <MetaRow label="Size" value={fileSizeLabel(asset.fileSizeBytes)} />
              <MetaRow label="Uploaded" value={createdAt} />
              <MetaRow label="Asset ID" value={asset.id} mono />
            </dl>

            <div className="mt-4 border-t border-gray-100 pt-4">
              <a
                href={asset.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-100"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                  <path
                    fillRule="evenodd"
                    d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
                Download
              </a>
            </div>
          </div>

          {/* Linked order card */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Order linkage</h2>

            {asset.linkedOrderId ? (
              <div className="space-y-2.5 text-sm">
                <MetaRow label="Order" value={asset.linkedOrderNumber ?? '—'} />
                <MetaRow label="Customer" value={asset.linkedCustomerName ?? '—'} />
                <MetaRow label="Product" value={asset.linkedProductName ?? '—'} />
                {asset.printPosition && (
                  <MetaRow label="Print position" value={asset.printPosition} />
                )}
                {asset.designNote && (
                  <div>
                    <dt className="mb-0.5 text-xs text-gray-500">Design note</dt>
                    <dd className="rounded-md bg-gray-50 p-2 text-xs text-gray-700 italic">
                      &ldquo;{asset.designNote}&rdquo;
                    </dd>
                  </div>
                )}

                <div className="pt-1">
                  <Link
                    href={`/admin/orders/${asset.linkedOrderId}`}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 py-2 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100"
                  >
                    View order {asset.linkedOrderNumber} →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4 text-center text-gray-400">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-xs">Not linked to any order</p>
                <p className="text-[11px] text-gray-400">This asset was uploaded but not yet used in an order.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MetaRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-28 shrink-0 text-xs text-gray-500">{label}</dt>
      <dd className={`break-all text-gray-800 ${mono ? 'font-mono text-[10px]' : ''}`}>{value}</dd>
    </div>
  )
}
