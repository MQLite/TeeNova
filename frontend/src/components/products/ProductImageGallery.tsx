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

/**
 * Compact product image gallery (Jira 9301): bounded aspect-square frame, thumbnail strip, and a
 * desktop-only hover magnifier. The magnifier is a decorative, pointer-driven overlay — it never
 * changes layout, never intercepts thumbnail/button clicks, and is disabled on touch and when no
 * image is present. Image storage/upload/data model is unchanged; this is presentation only.
 */
export function ProductImageGallery({ productName, activeImage, images, onSelectImage, className }: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null)
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
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 100
    setLens({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) })
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
              src={activeUrl}
              alt={productName}
              className="h-full w-full object-contain p-5"
            />
            {magnifierActive && lens && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage: `url(${activeUrl})`,
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: `${MAGNIFIER_ZOOM * 100}%`,
                  backgroundPosition: `${lens.x}% ${lens.y}%`,
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
