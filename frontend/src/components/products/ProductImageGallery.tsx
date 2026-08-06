'use client'

import { useEffect, useRef, useState } from 'react'
import NextImage from 'next/image'
import { isOptimizableImageUrl, resolveImageUrl } from '@/lib/image-utils'
import type { ProductImage } from '@/types'

interface Props {
  /** Product name — drives the main image alt text. */
  productName: string
  /** Currently displayed image (null → placeholder). */
  activeImage: ProductImage | null
  /** Colour-filtered images for the thumbnail strip. */
  images: ProductImage[]
  /** Select a thumbnail by image id. */
  onSelectImage: (imageId: string) => void
  /**
   * Colour the gallery is currently showing, used to make the main image's alt text specific
   * (Jira 10304). Only ever taken from real variant data — never invented.
   */
  selectedColor?: string | null
  /**
   * Marks the main image as the LCP candidate. Every current caller renders this gallery as the
   * above-the-fold product hero, so it defaults to true; thumbnails always stay lazy.
   */
  priority?: boolean
  className?: string
}

/** Responsive width hint for the main frame: full width on mobile, capped at the frame's max width. */
const MAIN_IMAGE_SIZES = '(max-width: 640px) 100vw, 440px'
/** Thumbnails render in a 4-column grid inside the same column. */
const THUMBNAIL_SIZES = '(max-width: 640px) 25vw, 110px'

/** Background zoom factor for the desktop hover magnifier. */
const MAGNIFIER_ZOOM = 2.2
/** Diameter (px) of the circular magnifier lens. */
const LENS_SIZE = 150

/** Resolved lens geometry, in pixels relative to the image frame. */
interface LensState {
  /** Cursor position relative to the frame (lens is centred here). */
  left: number
  top: number
  /** background-position offset within the lens. */
  bgX: number
  bgY: number
  /** background-size (the zoomed rendered-image dimensions). */
  bgW: number
  bgH: number
}

/**
 * Compact product image gallery (Jira 9301/9306): bounded aspect-square frame, thumbnail strip, and a
 * desktop-only hover magnifier. The magnifier is a true *local* lens (Jira 9306) — a small circular
 * overlay that follows the cursor and magnifies only the area beneath it; the underlying image stays
 * visible normally. It never changes layout, never intercepts thumbnail/button clicks, and is disabled
 * on touch and when no image is present. Image storage/upload/data model is unchanged; presentation only.
 *
 * Jira 10304: the frame now renders through `next/image` when the resolved URL is inside the
 * configured catalogue image origin (see `isOptimizableImageUrl`), giving responsive `sizes`,
 * priority loading for the main image and lazy loading for thumbnails. The aspect-square frame keeps
 * dimensions stable before the image arrives, and a failed load degrades to the existing placeholder
 * instead of an empty box. The magnifier deliberately keeps the *original* URL as its background —
 * a downscaled optimizer variant would look blurry at 2.2× zoom, and it is only requested once the
 * customer actually hovers on a desktop pointer.
 */
export function ProductImageGallery({
  productName,
  activeImage,
  images,
  onSelectImage,
  selectedColor,
  priority = true,
  className,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [lens, setLens] = useState<LensState | null>(null)
  const [canMagnify, setCanMagnify] = useState(false)
  const [failedUrls, setFailedUrls] = useState<Record<string, true>>({})

  const resolvedUrl = activeImage ? resolveImageUrl(activeImage.url) : null
  const activeUrl = resolvedUrl && !failedUrls[resolvedUrl] ? resolvedUrl : null
  const magnifierActive = canMagnify && Boolean(activeUrl)

  // Alt text is built only from verified data: the product name, plus the colour when one is active.
  const mainAlt = selectedColor ? `${productName} — ${selectedColor}` : productName

  function markFailed(url: string) {
    setFailedUrls((previous) => (previous[url] ? previous : { ...previous, [url]: true }))
  }

  // Enable the magnifier only on hover-capable, fine-pointer devices (desktop). Touch never enables it.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const update = () => setCanMagnify(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!magnifierActive) return
    const frame = frameRef.current
    const img = imgRef.current
    if (!frame || !img) return

    const natW = img.naturalWidth
    const natH = img.naturalHeight
    if (!natW || !natH) {
      setLens(null)
      return
    }

    const rect = frame.getBoundingClientRect()
    // The <img> fills the frame (h-full w-full) but pads its content (p-5); object-contain then
    // letterboxes the natural image inside that padded content box. Resolve the actual rendered
    // image rect so the lens maps cursor → image coordinates correctly and ignores the padding.
    const cs = window.getComputedStyle(img)
    const padL = parseFloat(cs.paddingLeft) || 0
    const padR = parseFloat(cs.paddingRight) || 0
    const padT = parseFloat(cs.paddingTop) || 0
    const padB = parseFloat(cs.paddingBottom) || 0

    const contentW = rect.width - padL - padR
    const contentH = rect.height - padT - padB
    const scale = Math.min(contentW / natW, contentH / natH)
    const renderedW = natW * scale
    const renderedH = natH * scale
    const renderedLeft = padL + (contentW - renderedW) / 2
    const renderedTop = padT + (contentH - renderedH) / 2

    const mx = event.clientX - rect.left
    const my = event.clientY - rect.top
    const cx = mx - renderedLeft
    const cy = my - renderedTop

    // Hide the lens over letterbox/padding (outside the actual rendered image).
    if (cx < 0 || cx > renderedW || cy < 0 || cy > renderedH) {
      setLens(null)
      return
    }

    // Magnify only the local area: scale the rendered image and offset it so the point under the
    // cursor lands at the lens centre.
    const bgW = renderedW * MAGNIFIER_ZOOM
    const bgH = renderedH * MAGNIFIER_ZOOM
    setLens({
      left: mx,
      top: my,
      bgX: LENS_SIZE / 2 - cx * MAGNIFIER_ZOOM,
      bgY: LENS_SIZE / 2 - cy * MAGNIFIER_ZOOM,
      bgW,
      bgH,
    })
  }

  return (
    <div className={className}>
      <div
        ref={frameRef}
        className="card relative mx-auto aspect-square w-full max-w-[440px] overflow-hidden"
        onMouseMove={magnifierActive ? handleMouseMove : undefined}
        onMouseLeave={() => setLens(null)}
      >
        {activeUrl ? (
          <>
            {isOptimizableImageUrl(activeUrl) ? (
              <NextImage
                ref={imgRef}
                src={activeUrl}
                alt={mainAlt}
                fill
                sizes={MAIN_IMAGE_SIZES}
                priority={priority}
                onError={() => markFailed(activeUrl)}
                className="object-contain p-5"
              />
            ) : (
              // Outside the configured catalogue image origin — never hand it to the optimizer.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={activeUrl}
                alt={mainAlt}
                onError={() => markFailed(activeUrl)}
                className="h-full w-full object-contain p-5"
              />
            )}
            {magnifierActive && lens && (
              <div
                aria-hidden
                className="pointer-events-none absolute z-10 rounded-full border border-line-control shadow-lg"
                style={{
                  width: LENS_SIZE,
                  height: LENS_SIZE,
                  left: lens.left,
                  top: lens.top,
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: '#fff',
                  backgroundImage: `url(${activeUrl})`,
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: `${lens.bgW}px ${lens.bgH}px`,
                  backgroundPosition: `${lens.bgX}px ${lens.bgY}px`,
                }}
              />
            )}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-sunken">
            <svg viewBox="0 0 200 220" className="h-36 w-36 text-black/[0.06]" fill="currentColor">
              <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
            </svg>
          </div>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {images.map((image) => {
            const isActive = image.id === activeImage?.id
            const thumbUrl = resolveImageUrl(image.url)
            const usable = thumbUrl && !failedUrls[thumbUrl] ? thumbUrl : null
            return (
              <button
                key={image.id}
                type="button"
                onClick={() => onSelectImage(image.id)}
                aria-pressed={isActive}
                className={`relative aspect-square overflow-hidden rounded-2xl border bg-white transition-all ${
                  isActive ? 'border-ink shadow-sm' : 'border-line hover:border-line-strong'
                }`}
              >
                {/* Thumbnails are never priority — only the main frame competes for LCP. */}
                {usable && isOptimizableImageUrl(usable) ? (
                  <NextImage
                    src={usable}
                    alt=""
                    fill
                    sizes={THUMBNAIL_SIZES}
                    loading="lazy"
                    onError={() => markFailed(usable)}
                    className="object-contain p-2"
                  />
                ) : usable ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={usable}
                    alt=""
                    loading="lazy"
                    onError={() => markFailed(usable)}
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <span aria-hidden className="block h-full w-full bg-surface-sunken" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
