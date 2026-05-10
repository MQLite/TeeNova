'use client'

import type { MatrixCell } from '@/types'

interface Props {
  cell: MatrixCell
  disabled?: boolean
  onChange: (updates: Partial<MatrixCell>) => void
}

export function MatrixCellInput({ cell, disabled, onChange }: Props) {
  if (!cell.isAvailable) {
    return (
      <div className="flex h-full min-h-[48px] items-center justify-between gap-1 rounded-xl bg-black/[0.03] px-3 py-1">
        <span className="font-mono text-sm uppercase tracking-[0.54px] text-black/35">N/A</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ isAvailable: true })}
          title="Restore — mark as available"
          className="rounded-lg px-1.5 py-0.5 font-mono text-xs uppercase tracking-[0.54px] text-black/30 transition-colors hover:bg-black/[0.06] hover:text-black/55 disabled:opacity-40"
        >
          ↩
        </button>
      </div>
    )
  }

  const displayValue = cell.priceAdjustment === '' ? '' : String(cell.priceAdjustment)
  const isInvalid    = cell.priceAdjustment === ''

  return (
    <div className="flex min-h-[48px] items-center gap-1 rounded-xl px-1 py-1">
      <div className="relative min-w-0 flex-1">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-black/35">
          $
        </span>
        <input
          type="number"
          value={displayValue}
          step="0.01"
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') {
              onChange({ priceAdjustment: '' })
            } else {
              const n = parseFloat(raw)
              onChange({ priceAdjustment: isNaN(n) ? '' : n })
            }
          }}
          className={[
            'w-full rounded-lg border bg-white py-2 pl-6 pr-1 text-sm text-black',
            'focus:outline-none focus:ring-1 focus:ring-black/20',
            'disabled:opacity-50',
            isInvalid
              ? 'border-red-300 bg-red-50/50'
              : 'border-black/[0.10]',
          ].join(' ')}
        />
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange({ isAvailable: false, priceAdjustment: 0 })}
        title="Mark as N/A — unavailable"
        className="shrink-0 rounded-lg p-1 text-black/20 transition-colors hover:bg-red-50 hover:text-red-400 disabled:opacity-40"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
