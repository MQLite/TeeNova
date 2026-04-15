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
        <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
          Print Positions
        </p>
        <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
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
                'relative flex flex-col items-center gap-1 rounded-lg border py-2.5 px-2 text-center transition-all duration-150 focus-visible:outline-dashed focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2',
                isSelected
                  ? 'border-black bg-black text-white'
                  : 'border-black/[0.10] bg-white text-black/55 hover:border-black/25 hover:text-black',
              )}
            >
              {isSelected && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[9px] font-medium text-white">
                  ✓
                </span>
              )}
              <span className="text-base leading-none">{positionIcons[pos.name] ?? '◼'}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.54px] leading-tight">{pos.displayLabel}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
