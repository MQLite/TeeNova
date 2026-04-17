'use client'

import { useRef } from 'react'
import { catalogApi } from '@/api/catalog'
import type { ProductImage } from '@/types'

interface ImageUploadButtonProps {
  productId: string
  uploading: boolean
  onUploadStart: () => void
  onUploaded: (image: ProductImage) => void
  onError: (message: string) => void
}

const ACCEPTED = 'image/jpeg,image/png,image/webp'

export function ImageUploadButton({
  productId,
  uploading,
  onUploadStart,
  onUploaded,
  onError,
}: ImageUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset so the same file can be re-selected after an error
    e.target.value = ''

    onUploadStart()
    try {
      const image = await catalogApi.uploadProductImage(productId, file)
      onUploaded(image)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      onError(msg)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        onChange={handleChange}
        disabled={uploading}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-black/[0.12] bg-black/[0.01] transition-colors hover:border-black/[0.25] hover:bg-black/[0.03] disabled:pointer-events-none disabled:opacity-50"
      >
        {uploading ? (
          <svg className="h-5 w-5 animate-spin text-black/40" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="h-5 w-5 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/35">
          {uploading ? 'Uploading…' : 'Add image'}
        </span>
      </button>
    </>
  )
}
