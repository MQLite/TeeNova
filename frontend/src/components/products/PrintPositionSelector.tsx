'use client'

import clsx from 'clsx'
import type { PrintPositionOption } from '@/types'

interface PrintPositionSelectorProps {
  positions: PrintPositionOption[]
  selected: number[]
  onChange: (values: number[]) => void
}

const positionIcons: Record<string, string> = {
  FrontCenter: '⬛',
  BackCenter:  '⬛',
  LeftChest:   '◧',
  RightChest:  '◨',
  LeftSleeve:  '◁',
  RightSleeve: '▷',
  NeckLabel:   '▽',
}

export function PrintPositionSelector({ positions, selected, onChange }: PrintPositionSelectorProps) {
  function toggle(value: number) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Print Positions</p>
        <span className="text-xs text-gray-400">
          {selected.length === 0 ? 'Select one or more' : `${selected.length} selected`}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {positions.map((pos) => {
          const isSelected = selected.includes(pos.value)
          return (
            <button
              key={pos.value}
              type="button"
              onClick={() => toggle(pos.value)}
              title={pos.displayLabel}
              className={clsx(
                'relative flex flex-col items-center gap-1 rounded-xl border py-2.5 px-2 text-center transition-all duration-150',
                isSelected
                  ? 'border-brand-600 bg-brand-50 text-brand-700 shadow-sm ring-2 ring-brand-100'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-600',
              )}
            >
              {isSelected && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[9px] font-bold text-white shadow">
                  ✓
                </span>
              )}
              <span className="text-base leading-none">{positionIcons[pos.name] ?? '◼'}</span>
              <span className="text-[10px] font-medium leading-tight">{pos.displayLabel}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
