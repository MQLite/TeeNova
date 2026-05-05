'use client'

import clsx from 'clsx'
import type { PrintArea } from '@/types'

interface PrintAreaSelectorProps {
  areas: PrintArea[]
  selectedAreaIds: string[]
  onChange: (areaIds: string[]) => void
}

export function PrintAreaSelector({ areas, selectedAreaIds, onChange }: PrintAreaSelectorProps) {
  function toggle(areaId: string) {
    onChange(
      selectedAreaIds.includes(areaId)
        ? selectedAreaIds.filter((id) => id !== areaId)
        : [...selectedAreaIds, areaId],
    )
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
          Print Areas
        </p>
        <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
          {selectedAreaIds.length === 0 ? 'Optional' : `${selectedAreaIds.length} selected`}
        </span>
      </div>

      {areas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/[0.12] py-4 text-center text-sm text-black/55">
          No print areas available right now.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {areas.map((area) => {
            const isSelected = selectedAreaIds.includes(area.id)

            return (
              <button
                key={area.id}
                type="button"
                onClick={() => toggle(area.id)}
                className={clsx(
                  'rounded-2xl border px-4 py-3 text-left transition-all duration-150',
                  isSelected
                    ? 'border-black bg-black text-white'
                    : 'border-black/[0.10] bg-white text-black/60 hover:border-black/25 hover:text-black',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                      {area.name}
                    </div>
                    <div className={clsx(
                      'mt-1 font-mono text-[10px] uppercase tracking-[0.54px]',
                      isSelected ? 'text-white/70' : 'text-black/45',
                    )}>
                      {area.code}
                    </div>
                  </div>
                  <div className={clsx(
                    'text-sm tabular-nums',
                    isSelected ? 'text-white' : 'text-black/55',
                  )}>
                    +${area.basePrice.toFixed(2)}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
