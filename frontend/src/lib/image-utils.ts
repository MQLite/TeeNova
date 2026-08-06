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

/** Origin of the public API base, or null when it is not a parseable absolute URL. */
function apiOrigin(): string | null {
  try {
    return new URL(API_BASE).origin
  } catch {
    return null
  }
}

/**
 * Path prefix of catalogue product images (`LocalFileStorageService`: wwwroot/uploads/products).
 * Deliberately narrower than `/uploads/`: customer design artwork lives under `/uploads/designs/`
 * and is never routed through the public image optimizer.
 */
const CATALOG_IMAGE_PATH_PREFIX = '/uploads/products/'

/**
 * True when a resolved image URL may be handed to `next/image` (Jira 10304).
 *
 * `next/image` throws at request time for any URL missing from `images.remotePatterns`, which would
 * turn a misconfigured deployment into a broken product page. `next.config.mjs` derives its single
 * remote pattern from `NEXT_PUBLIC_API_BASE_URL` + this same path prefix, and this check reads the
 * *same* values, so the optimizer is used only for URLs the build is known to allow. Anything else —
 * an absolute URL an Admin stored pointing at a third-party host, a design-artwork path, or an
 * unparseable value — falls back to a plain `<img>` rather than erroring. No wildcard host is ever
 * permitted.
 */
export function isOptimizableImageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const origin = apiOrigin()
  if (!origin) return false
  try {
    const parsed = new URL(url)
    return parsed.origin === origin && parsed.pathname.startsWith(CATALOG_IMAGE_PATH_PREFIX)
  } catch {
    return false
  }
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
