'use client'

import { useRef } from 'react'
import type { ProductImage } from '@/types'
import { ImageCard } from './ImageCard'

const ACCEPTED = 'image/jpeg,image/png,image/webp'

interface Props {
  title: string
  groupColor: string | null
  isOrphaned?: boolean
  noUpload?: boolean
  images: ProductImage[]
  variantColors: string[]
  isUploading: boolean
  isCurrentlyUploading: boolean
  confirmDeleteId: string | null
  deleteLoading: boolean
  setPrimaryLoading: string | null
  onUploadFile: (color: string | null, file: File) => void
  onSetPrimary: (imageId: string) => void
  onDeleteRequest: (imageId: string) => void
  onDeleteConfirm: (imageId: string) => void
  onDeleteCancel: () => void
  onMoveColor: (imageId: string, color: string | null) => Promise<void>
}

export function ColorImageGroup({
  title,
  groupColor,
  isOrphaned = false,
  noUpload = false,
  images,
  variantColors,
  isUploading,
  isCurrentlyUploading,
  confirmDeleteId,
  deleteLoading,
  setPrimaryLoading,
  onUploadFile,
  onSetPrimary,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  onMoveColor,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    onUploadFile(groupColor, file)
  }

  return (
    <div>
      {/* Section header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isOrphaned && (
            <svg
              className="h-3.5 w-3.5 flex-shrink-0 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
              />
            </svg>
          )}
          <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
            {title}
          </span>
          {isOrphaned && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.54px] text-amber-700">
              Unmatched
            </span>
          )}
        </div>
        <span className="rounded-full border border-black/[0.06] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.54px] text-black/35">
          {images.length}
        </span>
      </div>

      {/* Orphaned warning */}
      {isOrphaned && (
        <p className="mb-3 font-mono text-[10px] tracking-[0.3px] text-amber-700">
          This color has no matching variant. Add it to the matrix or move these images to a valid
          color.
        </p>
      )}

      {/* Empty state */}
      {images.length === 0 && !isCurrentlyUploading && !isOrphaned && (
        <p className="mb-3 font-mono text-[10px] tracking-[0.3px] text-black/35">
          No images for this color yet.
        </p>
      )}

      {/* Images + upload */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img) => (
          <ImageCard
            key={img.id}
            image={img}
            confirmDeleteId={confirmDeleteId}
            deleteLoading={deleteLoading}
            setPrimaryLoading={setPrimaryLoading}
            onSetPrimary={onSetPrimary}
            onDeleteRequest={onDeleteRequest}
            onDeleteConfirm={onDeleteConfirm}
            onDeleteCancel={onDeleteCancel}
            showColorMoveSelect
            variantColors={variantColors}
            onMoveColor={onMoveColor}
          />
        ))}

        {!noUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              className="sr-only"
              onChange={handleFileChange}
              disabled={isUploading}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-black/[0.12] bg-black/[0.01] transition-colors hover:border-black/[0.25] hover:bg-black/[0.03] disabled:pointer-events-none disabled:opacity-50"
            >
              {isCurrentlyUploading ? (
                <svg className="h-5 w-5 animate-spin text-black/40" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5 text-black/30"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              )}
              <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/35">
                {isCurrentlyUploading ? 'Uploading…' : 'Add image'}
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}
