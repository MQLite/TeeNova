'use client'

import type { PrintPositionOption } from '@/types'

interface DesignPreviewProps {
  productImageUrl: string | null
  designUrl: string | null
  selectedPosition: number | null
  positions: PrintPositionOption[]
}

// Approximate placement on a T-shirt silhouette (percent-based)
const positionLayout: Record<string, { top: string; left: string; width: string; transform?: string }> = {
  FrontCenter:  { top: '36%', left: '50%',  width: '38%', transform: 'translateX(-50%)' },
  BackCenter:   { top: '36%', left: '50%',  width: '38%', transform: 'translateX(-50%)' },
  LeftChest:    { top: '26%', left: '30%',  width: '20%' },
  RightChest:   { top: '26%', left: '50%',  width: '20%' },
  LeftSleeve:   { top: '20%', left: '7%',   width: '16%' },
  RightSleeve:  { top: '20%', left: '77%',  width: '16%' },
  NeckLabel:    { top: '6%',  left: '50%',  width: '14%', transform: 'translateX(-50%)' },
}

export function DesignPreview({ productImageUrl, designUrl, selectedPosition, positions }: DesignPreviewProps) {
  const positionName = positions.find((p) => p.value === selectedPosition)?.name ?? null
  const layout = positionName ? positionLayout[positionName] : null
  const positionLabel = positions.find((p) => p.value === selectedPosition)?.displayLabel

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Live Preview</p>
        {positionLabel && (
          <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">
            {positionLabel}
          </span>
        )}
      </div>

      {/* Preview frame */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-gray-100 bg-gradient-to-br from-gray-50 to-white shadow-inner">
        {productImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={productImageUrl}
            alt="Product"
            className="h-full w-full object-contain"
            style={{ minHeight: 300 }}
          />
        ) : (
          <div className="flex items-center justify-center" style={{ minHeight: 300 }}>
            <PlaceholderTShirt />
          </div>
        )}

        {/* Design overlay */}
        {designUrl && layout && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={designUrl}
            alt="Your design"
            className="absolute object-contain opacity-90"
            style={{
              top: layout.top,
              left: layout.left,
              width: layout.width,
              transform: layout.transform,
              maxHeight: '30%',
              filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))',
            }}
          />
        )}

        {/* Upload prompt when no design */}
        {!designUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="rounded-2xl bg-white/80 px-5 py-3 text-center shadow-sm backdrop-blur-sm border border-gray-100">
              <p className="text-sm font-semibold text-gray-700">Upload a design</p>
              <p className="text-xs text-gray-400 mt-0.5">to see your preview here</p>
            </div>
          </div>
        )}

        {/* Position label badge */}
        {positionName && (
          <div className="absolute bottom-3 right-3 rounded-xl bg-black/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
            {positionLabel}
          </div>
        )}

        {/* Design uploaded badge */}
        {designUrl && (
          <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-green-500 px-2.5 py-1 text-[10px] font-bold text-white shadow">
            <span>✓</span> Design applied
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-gray-400">
        Preview is approximate — actual print may vary slightly
      </p>
    </div>
  )
}

function PlaceholderTShirt() {
  return (
    <svg viewBox="0 0 200 220" className="h-52 w-52 text-gray-200" fill="currentColor">
      <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
    </svg>
  )
}
