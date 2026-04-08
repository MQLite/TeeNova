'use client'

import type { PrintPositionOption } from '@/types'

interface DesignPreviewProps {
  productImageUrl: string | null
  positionUploads: Record<number, string>  // positionValue → designUrl
  selectedPositions: number[]
  positions: PrintPositionOption[]
}

const positionLayout: Record<string, { top: string; left: string; width: string; transform?: string }> = {
  FrontCenter: { top: '36%', left: '50%', width: '38%', transform: 'translateX(-50%)' },
  BackCenter:  { top: '36%', left: '50%', width: '38%', transform: 'translateX(-50%)' },
  LeftChest:   { top: '26%', left: '30%', width: '20%' },
  RightChest:  { top: '26%', left: '50%', width: '20%' },
  LeftSleeve:  { top: '20%', left: '7%',  width: '16%' },
  RightSleeve: { top: '20%', left: '77%', width: '16%' },
  NeckLabel:   { top: '6%',  left: '50%', width: '14%', transform: 'translateX(-50%)' },
}

export function DesignPreview({ productImageUrl, positionUploads, selectedPositions, positions }: DesignPreviewProps) {
  const uploadedCount = Object.keys(positionUploads).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Live Preview</p>
        {uploadedCount > 0 && (
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-bold text-green-700">
            ✓ {uploadedCount} design{uploadedCount !== 1 ? 's' : ''} applied
          </span>
        )}
      </div>

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

        {/* Dashed placeholders for selected positions with no upload */}
        {selectedPositions.map((posVal) => {
          const posName = positions.find((p) => p.value === posVal)?.name ?? null
          const layout = posName ? positionLayout[posName] : null
          if (!layout || positionUploads[posVal]) return null
          return (
            <div
              key={`placeholder-${posVal}`}
              className="absolute rounded-lg border-2 border-dashed border-brand-300/60"
              style={{
                top: layout.top,
                left: layout.left,
                width: layout.width,
                transform: layout.transform,
                minHeight: '8%',
                aspectRatio: '1',
              }}
            />
          )
        })}

        {/* Design overlays for all uploaded positions */}
        {selectedPositions.map((posVal) => {
          const posName = positions.find((p) => p.value === posVal)?.name ?? null
          const designUrl = positionUploads[posVal]
          const layout = posName ? positionLayout[posName] : null
          if (!designUrl || !layout) return null
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`design-${posVal}`}
              src={designUrl}
              alt="Design"
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
          )
        })}

        {/* Empty state */}
        {selectedPositions.length === 0 && uploadedCount === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="rounded-2xl bg-white/80 px-5 py-3 text-center shadow-sm backdrop-blur-sm border border-gray-100">
              <p className="text-sm font-semibold text-gray-700">Select a position & upload</p>
              <p className="text-xs text-gray-400 mt-0.5">to see your preview here</p>
            </div>
          </div>
        )}

        {/* Position count badge */}
        {selectedPositions.length > 0 && (
          <div className="absolute bottom-3 right-3 rounded-xl bg-black/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
            {selectedPositions.length} position{selectedPositions.length !== 1 ? 's' : ''}
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
