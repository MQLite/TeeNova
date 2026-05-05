'use client'

import type { PrintArea, PrintSize } from '@/types'

interface PrintSizeSelectorProps {
  selectedAreas: PrintArea[]
  sizes: PrintSize[]
  printSizeByArea: Record<string, string | undefined>
  errors?: Record<string, string | undefined>
  onChange: (areaId: string, sizeId: string) => void
}

export function PrintSizeSelector({
  selectedAreas,
  sizes,
  printSizeByArea,
  errors,
  onChange,
}: PrintSizeSelectorProps) {
  if (selectedAreas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-black/[0.12] py-4 text-center text-sm text-black/55">
        No print areas selected. Blank garment pricing is available.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {selectedAreas.map((area) => {
        const selectedSizeId = printSizeByArea[area.id] ?? ''
        const error = errors?.[area.id]

        return (
          <div key={area.id} className="rounded-2xl border border-black/[0.08] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                  {area.name}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                  Choose one print size
                </p>
              </div>
              <span className="text-sm tabular-nums text-black/55">+${area.basePrice.toFixed(2)}</span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {sizes.map((size) => {
                const isSelected = selectedSizeId === size.id
                return (
                  <button
                    key={size.id}
                    type="button"
                    onClick={() => onChange(area.id, size.id)}
                    className={[
                      'rounded-xl border px-3 py-2 text-left transition-colors',
                      isSelected
                        ? 'border-black bg-black text-white'
                        : 'border-black/[0.10] bg-white text-black/60 hover:border-black/25 hover:text-black',
                    ].join(' ')}
                  >
                    <span className="block text-sm" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                      {size.name}
                    </span>
                    <span className={`mt-1 block font-mono text-[10px] uppercase tracking-[0.54px] ${isSelected ? 'text-white/70' : 'text-black/45'}`}>
                      +${size.basePrice.toFixed(2)}
                    </span>
                  </button>
                )
              })}
            </div>

            {error && (
              <p className="mt-2 text-sm text-red-600" style={{ letterSpacing: '-0.14px' }}>
                {error}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
