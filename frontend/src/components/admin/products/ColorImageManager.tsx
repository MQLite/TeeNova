'use client'

import { useState } from 'react'
import { catalogApi } from '@/api/catalog'
import type { ProductImage } from '@/types'
import { ColorImageGroup } from './ColorImageGroup'

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeColor(value?: string | null): string {
  return (value ?? '').trim().toLowerCase()
}

interface GroupedImages {
  defaultImages: ProductImage[]
  colorGroups: Array<{ color: string; images: ProductImage[] }>
  orphanedGroups: Array<{ color: string; images: ProductImage[] }>
}

function groupImages(images: ProductImage[], variantColors: string[]): GroupedImages {
  // Map normalized color string -> canonical casing from variantColors
  const normalizedVariantColors = new Map(variantColors.map((c) => [normalizeColor(c), c]))

  const defaultImages: ProductImage[] = []
  const colorBuckets = new Map<string, ProductImage[]>() // normalized -> images
  const orphanedBuckets = new Map<string, ProductImage[]>() // original color -> images

  for (const img of images) {
    const norm = normalizeColor(img.color)
    if (norm === '') {
      defaultImages.push(img)
    } else if (normalizedVariantColors.has(norm)) {
      if (!colorBuckets.has(norm)) colorBuckets.set(norm, [])
      colorBuckets.get(norm)!.push(img)
    } else {
      const origColor = img.color!
      if (!orphanedBuckets.has(origColor)) orphanedBuckets.set(origColor, [])
      orphanedBuckets.get(origColor)!.push(img)
    }
  }

  const colorGroups = variantColors.map((color) => ({
    color,
    images: colorBuckets.get(normalizeColor(color)) ?? [],
  }))

  const orphanedGroups = Array.from(orphanedBuckets.entries()).map(([color, imgs]) => ({
    color,
    images: imgs,
  }))

  return { defaultImages, colorGroups, orphanedGroups }
}

function sortImages(images: ProductImage[]): ProductImage[] {
  return [...images].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  productId: string
  initialImages: ProductImage[]
  variantColors: string[]
}

export function ColorImageManager({ productId, initialImages, variantColors }: Props) {
  const [images, setImages] = useState<ProductImage[]>(() => sortImages(initialImages))
  const [uploadingColor, setUploadingColor] = useState<{ color: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [setPrimaryLoading, setSetPrimaryLoading] = useState<string | null>(null)

  const isUploading = uploadingColor !== null

  // ── Upload ──────────────────────────────────────────────────────────────────

  async function handleUpload(color: string | null, file: File) {
    setUploadingColor({ color })
    setError(null)
    try {
      const uploaded = await catalogApi.uploadProductImage(productId, file)
      if (color !== null) {
        try {
          const assigned = await catalogApi.updateProductImage(productId, uploaded.id, { color })
          setImages((prev) => sortImages([...prev, assigned]))
        } catch {
          // Color assignment failed; image lands in Default with an error notice
          setImages((prev) => sortImages([...prev, uploaded]))
          setError(
            `Image uploaded but could not assign color "${color}". It appears in Default — move it manually.`,
          )
        }
      } else {
        setImages((prev) => sortImages([...prev, uploaded]))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setUploadingColor(null)
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
          const sorted = [...remaining].sort((a, b) => a.sortOrder - b.sortOrder)
          sorted[0] = { ...sorted[0], isPrimary: true }
          return sortImages(sorted)
        }
        return remaining
      })
      setConfirmDeleteId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed. Please try again.')
      // Keep confirmDeleteId open so user can retry or cancel
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Set Primary ─────────────────────────────────────────────────────────────

  async function handleSetPrimary(imageId: string) {
    setSetPrimaryLoading(imageId)
    try {
      await catalogApi.setPrimaryProductImage(productId, imageId)
      setImages((prev) =>
        sortImages(prev.map((img) => ({ ...img, isPrimary: img.id === imageId }))),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set primary image.')
    } finally {
      setSetPrimaryLoading(null)
    }
  }

  // ── Move Color ──────────────────────────────────────────────────────────────

  async function handleMoveColor(imageId: string, newColor: string | null) {
    try {
      const updated = await catalogApi.updateProductImage(productId, imageId, { color: newColor })
      setImages((prev) => prev.map((img) => (img.id === imageId ? updated : img)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move image.')
      throw err // re-throw so ImageCard resets its moving state
    }
  }

  // ── Grouping ────────────────────────────────────────────────────────────────

  const { defaultImages, colorGroups, orphanedGroups } = groupImages(images, variantColors)
  const totalImages = images.length

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
            Image Gallery
          </p>
          <h2 className="mt-1 text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
            Color Images
          </h2>
        </div>
        <span className="rounded-full border border-black/[0.08] bg-black/[0.02] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
          {totalImages} image{totalImages !== 1 ? 's' : ''}
        </span>
      </div>

      {/* No variant colors notice */}
      {variantColors.length === 0 && (
        <p className="mb-5 font-mono text-[10px] tracking-[0.3px] text-black/40">
          Add product variants with colors to manage color-specific images.
        </p>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
          <svg
            className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-400"
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
          <p className="flex-1 text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 transition-colors hover:text-red-600"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Default Images */}
      <ColorImageGroup
        title="Default"
        groupColor={null}
        images={defaultImages}
        variantColors={variantColors}
        isUploading={isUploading}
        isCurrentlyUploading={isUploading && uploadingColor?.color === null}
        confirmDeleteId={confirmDeleteId}
        deleteLoading={deleteLoading}
        setPrimaryLoading={setPrimaryLoading}
        onUploadFile={handleUpload}
        onSetPrimary={handleSetPrimary}
        onDeleteRequest={(id) => setConfirmDeleteId(id)}
        onDeleteConfirm={handleDeleteConfirm}
        onDeleteCancel={() => setConfirmDeleteId(null)}
        onMoveColor={handleMoveColor}
      />

      {/* Per-color groups */}
      {colorGroups.map(({ color, images: colorImages }) => (
        <div key={color} className="mt-5 border-t border-black/[0.06] pt-5">
          <ColorImageGroup
            title={color}
            groupColor={color}
            images={colorImages}
            variantColors={variantColors}
            isUploading={isUploading}
            isCurrentlyUploading={isUploading && uploadingColor?.color === color}
            confirmDeleteId={confirmDeleteId}
            deleteLoading={deleteLoading}
            setPrimaryLoading={setPrimaryLoading}
            onUploadFile={handleUpload}
            onSetPrimary={handleSetPrimary}
            onDeleteRequest={(id) => setConfirmDeleteId(id)}
            onDeleteConfirm={handleDeleteConfirm}
            onDeleteCancel={() => setConfirmDeleteId(null)}
            onMoveColor={handleMoveColor}
          />
        </div>
      ))}

      {/* Orphaned groups */}
      {orphanedGroups.length > 0 && (
        <div className="mt-5 border-t border-black/[0.06] pt-5">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.54px] text-black/35">
            Unmatched colors
          </p>
          {orphanedGroups.map(({ color: orphanColor, images: orphanImages }) => (
            <div key={orphanColor} className="mt-3 first:mt-0">
              <ColorImageGroup
                title={`Unmatched: ${orphanColor}`}
                groupColor={orphanColor}
                isOrphaned
                noUpload
                images={orphanImages}
                variantColors={variantColors}
                isUploading={isUploading}
                isCurrentlyUploading={false}
                confirmDeleteId={confirmDeleteId}
                deleteLoading={deleteLoading}
                setPrimaryLoading={setPrimaryLoading}
                onUploadFile={handleUpload}
                onSetPrimary={handleSetPrimary}
                onDeleteRequest={(id) => setConfirmDeleteId(id)}
                onDeleteConfirm={handleDeleteConfirm}
                onDeleteCancel={() => setConfirmDeleteId(null)}
                onMoveColor={handleMoveColor}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
