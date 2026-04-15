'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { AdminAsset } from '@/types'
import {
  fileTypeCategory,
  fileTypeLabel,
  fileSizeLabel,
  isPreviewable,
} from '@/lib/file-utils'
import { filesApi } from '@/api/files'

const FILTERS = ['All', 'Images', 'PDFs', 'AI / Vector'] as const
type Filter = (typeof FILTERS)[number]

interface Props {
  assets: AdminAsset[]
}

export function AssetsGrid({ assets }: Props) {
  const [filter, setFilter] = useState<Filter>('All')
  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState<{ deletedCount: number; failedCount: number } | null>(null)

  const visible =
    filter === 'All'
      ? assets
      : assets.filter((a) => fileTypeCategory(a.contentType) === filter)

  async function handleCleanOrphans() {
    if (!confirm('Delete all uploaded assets that are not linked to any order? This cannot be undone.')) return
    setCleaning(true)
    setCleanResult(null)
    try {
      const result = await filesApi.cleanOrphanedAssets()
      setCleanResult(result)
      window.location.reload()
    } catch {
      setCleanResult({ deletedCount: 0, failedCount: -1 })
      setCleaning(false)
    }
  }

  return (
    <>
      {/* Toolbar */}
      <div className="admin-toolbar mb-6">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const count =
              f === 'All'
                ? assets.length
                : assets.filter((a) => fileTypeCategory(a.contentType) === f).length
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-[50px] border px-4 py-1.5 text-sm transition-colors ${
                  filter === f
                    ? 'border-black bg-black text-white shadow-sm'
                    : 'border-black/[0.12] bg-white text-black/50 hover:border-black/25 hover:text-black'
                }`}
                style={{ letterSpacing: '-0.14px' }}
              >
                {f}
                <span className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.54px] opacity-60">{count}</span>
              </button>
            )
          })}
        </div>

        <button
          onClick={handleCleanOrphans}
          disabled={cleaning}
          className="flex items-center gap-1.5 rounded-[50px] border border-red-200 bg-white px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40"
          style={{ letterSpacing: '-0.14px' }}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
          </svg>
          {cleaning ? 'Cleaning…' : 'Clean Orphaned'}
        </button>
      </div>

      {cleanResult && cleanResult.failedCount === -1 && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          Cleanup failed. Please try again.
        </p>
      )}

      {/* Grid */}
      {visible.length === 0 ? (
        <p className="py-16 text-center font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
          No assets in this category.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
        </div>
      )}
    </>
  )
}

function AssetCard({ asset }: { asset: AdminAsset }) {
  const label = fileTypeLabel(asset.contentType)
  const previewed = isPreviewable(asset.contentType)
  const date = new Date(asset.creationTime).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <Link
      href={`/admin/assets/${asset.id}`}
      className="group card hover-lift flex flex-col overflow-hidden"
    >
      {/* Preview area */}
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-black/[0.02]">
        {previewed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.fileUrl}
            alt={asset.originalFileName}
            className="h-full w-full object-contain p-3 transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-black/25">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-10 w-10">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="font-mono text-[10px] uppercase tracking-[0.54px]">{label}</span>
          </div>
        )}

        {/* Type badge */}
        <span className="absolute right-2 top-2 rounded-full border border-black/[0.08] bg-white/90 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.54px] text-black/50 backdrop-blur-sm">
          {label}
        </span>

        {/* Linked indicator */}
        {asset.linkedOrderId && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full border border-black/[0.08] bg-white/90 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.54px] text-black/50 backdrop-blur-sm">
            {asset.linkedOrderNumber}
          </span>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 items-center justify-between bg-gradient-to-t from-black/55 via-black/20 to-transparent px-3 py-3 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-white/85">
            {previewed ? 'Preview' : label}
          </span>
          <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.54px] text-black">
            Open
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-0.5 border-t border-black/[0.08] px-3 py-2.5">
        <p className="truncate text-xs text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}
           title={asset.originalFileName}>
          {asset.originalFileName}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
          {fileSizeLabel(asset.fileSizeBytes)} · {date}
        </p>
        {asset.linkedCustomerName && (
          <p className="mt-0.5 truncate text-[10px] text-black/55" style={{ letterSpacing: '-0.14px' }}>
            {asset.linkedCustomerName}
          </p>
        )}
      </div>
    </Link>
  )
}
