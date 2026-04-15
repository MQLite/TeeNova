'use client'

import { useMemo, useState } from 'react'
import type { ProductImage } from '@/types'

interface ProductImageGalleryProps {
  name: string
  images: ProductImage[]
}

function ProductImagePlaceholder() {
  return (
    <svg viewBox="0 0 200 220" className="h-28 w-28 text-black/[0.06]" fill="currentColor">
      <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
    </svg>
  )
}

export function ProductImageGallery({ name, images }: ProductImageGalleryProps) {
  const orderedImages = useMemo(
    () => [...images].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder),
    [images],
  )

  const [selectedId, setSelectedId] = useState(orderedImages[0]?.id ?? null)
  const selectedImage = orderedImages.find((image) => image.id === selectedId) ?? orderedImages[0]

  return (
    <div className="space-y-4">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[24px] border border-black/[0.08] bg-gradient-to-br from-black/[0.02] via-white to-black/[0.03]">
        {selectedImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selectedImage.url}
            alt={name}
            className="h-full w-full object-contain p-8"
          />
        ) : (
          <ProductImagePlaceholder />
        )}
      </div>

      {orderedImages.length > 1 && (
        <div className="grid grid-cols-4 gap-3">
          {orderedImages.map((image) => {
            const isActive = image.id === selectedImage?.id
            return (
              <button
                key={image.id}
                type="button"
                onClick={() => setSelectedId(image.id)}
                className={`relative overflow-hidden rounded-2xl border bg-white transition-all ${
                  isActive ? 'border-black shadow-card' : 'border-black/[0.08] hover:border-black/[0.20]'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="" className="aspect-square h-full w-full object-contain p-2" />
                {image.isPrimary && (
                  <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.54px] text-black/55">
                    Main
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
