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
        <p className="text-sm text-ink" style={{ fontWeight: 500 }}>
          Print Areas
        </p>
        <span className="eyebrow text-ink-muted">
          {selectedAreaIds.length === 0 ? 'Optional' : `${selectedAreaIds.length} selected`}
        </span>
      </div>

      {areas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong py-4 text-center text-sm text-ink-muted">
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
                    ? 'border-ink bg-surface-inverse text-white'
                    : 'border-line bg-white text-ink-secondary hover:border-line-control hover:text-ink',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm" style={{ fontWeight: 500 }}>
                      {area.name}
                    </div>
                    <div className={clsx(
                      'mt-1 eyebrow',
                      isSelected ? 'text-ink-inverse-secondary' : 'text-ink-muted',
                    )}>
                      {area.code}
                    </div>
                  </div>
                  <div className={clsx(
                    'text-sm tabular-nums',
                    isSelected ? 'text-white' : 'text-ink-muted',
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
