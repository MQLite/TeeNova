import type { ProductImage } from '@/types'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://localhost:44300'

/**
 * Resolves an image URL from the API so it is always usable in <img src>.
 * - Absolute URLs (http/https) are returned unchanged.
 * - Root-relative paths (/uploads/…, /images/…) are prefixed with the API origin
 *   so they resolve correctly when the frontend runs on a different port in development.
 * - null/undefined/empty → null (caller renders a placeholder instead).
 */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('/')) return `${API_BASE}${url}`
  return url
}

export function normalizeColor(color: string | null | undefined): string {
  return (color ?? '').trim().toLowerCase()
}

export function sortImages(images: ProductImage[]): ProductImage[] {
  return [...images].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
  )
}

export function filterImagesForColor(
  images: ProductImage[],
  selectedColor: string | null,
): ProductImage[] {
  if (images.length === 0) return []

  if (selectedColor !== null && selectedColor.trim() !== '') {
    const normalized = normalizeColor(selectedColor)

    // Step 1: images whose color matches selectedColor (case-insensitive, trimmed)
    const matched = images.filter((img) => normalizeColor(img.color) === normalized)
    if (matched.length > 0) return sortImages(matched)
  }

  // Step 2: images with no color assigned (null or empty string)
  const uncolored = images.filter((img) => !img.color || img.color.trim() === '')
  if (uncolored.length > 0) return sortImages(uncolored)

  // Step 3: final fallback — all images
  return sortImages(images)
}
