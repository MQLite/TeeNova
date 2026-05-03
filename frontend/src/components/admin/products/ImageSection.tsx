'use client'

import { useState } from 'react'
import { catalogApi } from '@/api/catalog'
import type { ProductImage } from '@/types'
import { ImageCard } from './ImageCard'
import { ImageUploadButton } from './ImageUploadButton'

interface ImageSectionProps {
  productId: string
  initialImages: ProductImage[]
}

export function ImageSection({ productId, initialImages }: ImageSectionProps) {
  const [images, setImages] = useState<ProductImage[]>(
    [...initialImages].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder),
  )
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [setPrimaryLoading, setSetPrimaryLoading] = useState<string | null>(null)

  // ── Upload ──────────────────────────────────────────────────────────────────

  function handleUploadStart() {
    setUploading(true)
    setUploadError(null)
  }

  function handleUploaded(image: ProductImage) {
    setUploading(false)
    setImages((prev) => {
      // If it's the first image it's already primary from the backend
      const updated = [...prev, image]
      return updated.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)
    })
  }

  function handleUploadError(message: string) {
    setUploading(false)
    setUploadError(message)
  }

  // ── Set Primary ─────────────────────────────────────────────────────────────

  async function handleSetPrimary(imageId: string) {
    setSetPrimaryLoading(imageId)
    try {
      await catalogApi.setPrimaryProductImage(productId, imageId)
      setImages((prev) =>
        prev
          .map((img) => ({ ...img, isPrimary: img.id === imageId }))
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder),
      )
    } catch {
      // silent — leave state unchanged
    } finally {
      setSetPrimaryLoading(null)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDeleteConfirm(imageId: string) {
    setDeleteLoading(true)
    const wasPrimary = images.find((i) => i.id === imageId)?.isPrimary ?? false
    try {
      await catalogApi.deleteProductImage(productId, imageId)
      setImages((prev) => {
        const remaining = prev.filter((i) => i.id !== imageId)
        if (wasPrimary && remaining.length > 0) {
          // Promote first by sortOrder
          const sorted = [...remaining].sort((a, b) => a.sortOrder - b.sortOrder)
          sorted[0] = { ...sorted[0], isPrimary: true }
          return sorted.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)
        }
        return remaining
      })
      setConfirmDeleteId(null)
    } catch {
      // leave confirmDeleteId open so user can retry or cancel
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Color ───────────────────────────────────────────────────────────────────

  async function handleColorSave(imageId: string, color: string | null) {
    try {
      const updated = await catalogApi.updateProductImage(productId, imageId, { color })
      setImages((prev) => prev.map((img) => (img.id === imageId ? updated : img)))
    } catch {
      // silent — UI already shows the optimistic value; it'll revert on next render
    }
  }

  return (
    <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Image Gallery</p>
          <h2 className="mt-1 text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
            Product imagery
          </h2>
        </div>
        <span className="rounded-full border border-black/[0.08] bg-black/[0.02] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
          {images.length} image{images.length !== 1 ? 's' : ''}
        </span>
      </div>

      <p className="mb-4 font-mono text-[10px] tracking-[0.3px] text-black/40">
        Image color should match variant color to appear when customers select that color.
      </p>

      {uploadError && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
          <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <p className="text-sm text-red-600">{uploadError}</p>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="ml-auto text-red-400 transition-colors hover:text-red-600"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((image) => (
          <ImageCard
            key={image.id}
            image={image}
            confirmDeleteId={confirmDeleteId}
            deleteLoading={deleteLoading}
            setPrimaryLoading={setPrimaryLoading}
            onSetPrimary={handleSetPrimary}
            onDeleteRequest={(id) => setConfirmDeleteId(id)}
            onDeleteConfirm={handleDeleteConfirm}
            onDeleteCancel={() => setConfirmDeleteId(null)}
            onColorSave={handleColorSave}
          />
        ))}
        <ImageUploadButton
          productId={productId}
          uploading={uploading}
          onUploadStart={handleUploadStart}
          onUploaded={handleUploaded}
          onError={handleUploadError}
        />
      </div>
    </section>
  )
}
