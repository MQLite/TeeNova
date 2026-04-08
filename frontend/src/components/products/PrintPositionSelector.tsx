'use client'

import clsx from 'clsx'
import type { PrintPositionOption } from '@/types'

interface PrintPositionSelectorProps {
  positions: PrintPositionOption[]
  selected: number | null
  onChange: (value: number) => void
}

// Position icons — simple SVG representations
const positionIcons: Record<string, string> = {
  FrontCenter:  '⬛',
  BackCenter:   '⬛',
  LeftChest:    '◧',
  RightChest:   '◨',
  LeftSleeve:   '◁',
  RightSleeve:  '▷',
  NeckLabel:    '▽',
}

export function PrintPositionSelector({ positions, selected, onChange }: PrintPositionSelectorProps) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Print Position</p>
        {selected !== null && (
          <span className="text-xs text-brand-600 font-medium">
            {positions.find(p => p.value === selected)?.displayLabel}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {positions.map((pos) => {
          const isSelected = selected === pos.value
          return (
            <button
              key={pos.value}
              type="button"
              onClick={() => onChange(pos.value)}
              title={pos.displayLabel}
              className={clsx(
                'flex flex-col items-center gap-1 rounded-xl border py-2.5 px-2 text-center transition-all duration-150',
                isSelected
                  ? 'border-brand-600 bg-brand-50 text-brand-700 shadow-sm ring-2 ring-brand-100'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-600',
              )}
            >
              <span className="text-base leading-none">{positionIcons[pos.name] ?? '◼'}</span>
              <span className="text-[10px] font-medium leading-tight">{pos.displayLabel}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
