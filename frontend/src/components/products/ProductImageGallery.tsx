'use client'

import { useEffect, useRef, useState } from 'react'
import { resolveImageUrl } from '@/lib/image-utils'
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
  className?: string
}

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
 */
export function ProductImageGallery({ productName, activeImage, images, onSelectImage, className }: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [lens, setLens] = useState<LensState | null>(null)
  const [canMagnify, setCanMagnify] = useState(false)

  const activeUrl = activeImage ? resolveImageUrl(activeImage.url) : null
  const magnifierActive = canMagnify && Boolean(activeUrl)

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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={activeUrl}
              alt={productName}
              className="h-full w-full object-contain p-5"
            />
            {magnifierActive && lens && (
              <div
                aria-hidden
                className="pointer-events-none absolute z-10 rounded-full border border-black/10 shadow-lg"
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
          <div className="flex h-full w-full items-center justify-center bg-black/[0.02]">
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
            return (
              <button
                key={image.id}
                type="button"
                onClick={() => onSelectImage(image.id)}
                className={`relative overflow-hidden rounded-2xl border bg-white transition-all ${
                  isActive ? 'border-black shadow-sm' : 'border-black/[0.08] hover:border-black/[0.20]'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolveImageUrl(image.url) ?? ''} alt="" className="aspect-square h-full w-full object-contain p-2" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
