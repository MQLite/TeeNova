'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { AdminAsset } from '@/types'
import {
  fileTypeBadgeClasses,
  fileTypeCategory,
  fileTypeLabel,
  fileSizeLabel,
  isPreviewable,
} from '@/lib/file-utils'

const FILTERS = ['All', 'Images', 'PDFs', 'AI / Vector'] as const
type Filter = (typeof FILTERS)[number]

interface Props {
  assets: AdminAsset[]
}

export function AssetsGrid({ assets }: Props) {
  const [filter, setFilter] = useState<Filter>('All')

  const visible =
    filter === 'All'
      ? assets
      : assets.filter((a) => fileTypeCategory(a.contentType) === filter)

  return (
    <>
      {/* Filter tabs */}
      <div className="mb-6 flex items-center gap-2">
        {FILTERS.map((f) => {
          const count = f === 'All' ? assets.length : assets.filter((a) => fileTypeCategory(a.contentType) === f).length
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f
                  ? 'border-brand-200 bg-brand-50 text-brand-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {f}
              <span className="ml-1.5 text-[10px] tabular-nums opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Grid */}
      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">No assets in this category.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
  const badgeCls = fileTypeBadgeClasses(asset.contentType)
  const previewed = isPreviewable(asset.contentType)
  const date = new Date(asset.creationTime).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <Link
      href={`/admin/assets/${asset.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Preview area */}
      <div className="relative flex h-36 items-center justify-center overflow-hidden bg-gray-50">
        {previewed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.fileUrl}
            alt={asset.originalFileName}
            className="h-full w-full object-contain p-3 transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-gray-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-10 w-10">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="text-xs font-medium">{label}</span>
          </div>
        )}

        {/* Type badge */}
        <span
          className={`absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeCls}`}
        >
          {label}
        </span>

        {/* Linked indicator */}
        {asset.linkedOrderId && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 shadow-sm">
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5 text-brand-500">
              <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm.75 4.5v2.75h2.75a.75.75 0 010 1.5H8.75v2.75a.75.75 0 01-1.5 0V8.75H4.5a.75.75 0 010-1.5h2.75V4.5a.75.75 0 011.5 0z" />
            </svg>
            {asset.linkedOrderNumber}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <p className="truncate text-xs font-medium text-gray-800" title={asset.originalFileName}>
          {asset.originalFileName}
        </p>
        <p className="text-[10px] text-gray-400">
          {fileSizeLabel(asset.fileSizeBytes)} · {date}
        </p>
        {asset.linkedCustomerName && (
          <p className="mt-0.5 truncate text-[10px] text-gray-500">{asset.linkedCustomerName}</p>
        )}
      </div>
    </Link>
  )
}