'use client'

import { useEffect, useRef, useState } from 'react'
import type { ProductImage } from '@/types'

interface ImageCardProps {
  image: ProductImage
  confirmDeleteId: string | null
  deleteLoading: boolean
  setPrimaryLoading: string | null
  onSetPrimary: (id: string) => void
  onDeleteRequest: (id: string) => void
  onDeleteConfirm: (id: string) => void
  onDeleteCancel: () => void
  onColorSave: (id: string, color: string | null) => void
}

export function ImageCard({
  image,
  confirmDeleteId,
  deleteLoading,
  setPrimaryLoading,
  onSetPrimary,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  onColorSave,
}: ImageCardProps) {
  const [colorInput, setColorInput] = useState(image.color ?? '')
  const colorRef = useRef(image.color ?? '')

  // Sync when the image prop changes (e.g. after a save)
  useEffect(() => {
    setColorInput(image.color ?? '')
    colorRef.current = image.color ?? ''
  }, [image.color])

  function commitColor() {
    const trimmed = colorInput.trim()
    const next = trimmed === '' ? null : trimmed
    if (next !== image.color) {
      onColorSave(image.id, next)
    }
  }

  const isConfirmingDelete = confirmDeleteId === image.id
  const isDeleting = isConfirmingDelete && deleteLoading
  const isSettingPrimary = setPrimaryLoading === image.id

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[20px] border border-black/[0.08] bg-white">
      {/* Image */}
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-black/[0.02]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url} alt="" className="h-full w-full object-contain p-3" />

        {image.isPrimary && (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.54px] text-black/55 shadow-sm">
            Main
          </span>
        )}
      </div>

      {/* Color tag */}
      <div className="px-3 py-2">
        <input
          type="text"
          value={colorInput}
          onChange={(e) => setColorInput(e.target.value)}
          onBlur={commitColor}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              setColorInput(image.color ?? '')
              e.currentTarget.blur()
            }
          }}
          placeholder="Color tag…"
          className="w-full rounded-lg border border-transparent bg-black/[0.03] px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/55 placeholder-black/25 transition-colors focus:border-black/[0.12] focus:bg-white focus:outline-none"
        />
      </div>

      {/* Actions */}
      <div className="px-3 pb-3">
        {isConfirmingDelete ? (
          <div className="flex items-center gap-1.5">
            <span className="flex-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
              Delete?
            </span>
            <button
              type="button"
              onClick={() => onDeleteConfirm(image.id)}
              disabled={isDeleting}
              className="rounded-lg bg-red-500 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-white transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {isDeleting ? '…' : 'Yes'}
            </button>
            <button
              type="button"
              onClick={onDeleteCancel}
              disabled={isDeleting}
              className="rounded-lg border border-black/[0.08] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/55 transition-colors hover:border-black/[0.2]"
            >
              No
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {!image.isPrimary && (
              <button
                type="button"
                onClick={() => onSetPrimary(image.id)}
                disabled={isSettingPrimary}
                className="flex-1 rounded-lg border border-black/[0.08] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/55 transition-colors hover:border-black/[0.2] hover:text-black disabled:opacity-40"
              >
                {isSettingPrimary ? '…' : 'Set main'}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDeleteRequest(image.id)}
              className="rounded-lg border border-black/[0.08] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/40 transition-colors hover:border-red-200 hover:text-red-500"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
