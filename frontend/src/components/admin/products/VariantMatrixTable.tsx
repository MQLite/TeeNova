'use client'

import type { MatrixCell } from '@/types'
import { MatrixCellInput } from './MatrixCellInput'

interface Props {
  sizes: string[]
  colors: string[]
  cells: Record<string, MatrixCell>
  disabled?: boolean
  onCellChange: (key: string, updates: Partial<MatrixCell>) => void
  /** Called with the color whose entire row should be marked unavailable. */
  onMarkRowUnavailable: (color: string) => void
  /** Called with the size whose entire column should be marked unavailable. */
  onMarkColUnavailable: (size: string) => void
  onSetRowPrice: (color: string, price: number) => void
  onSetColPrice: (size: string, price: number) => void
}

/** Derive the Record key for a given size + color. Must match VariantMatrixEditor's cellKey(). */
function cellKey(size: string, color: string): string {
  return `${size.toLowerCase()}|${color.toLowerCase()}`
}

const MONO_LABEL = 'font-mono text-xs uppercase tracking-[0.54px]'

export function VariantMatrixTable({
  sizes,
  colors,
  cells,
  disabled,
  onCellChange,
  onMarkRowUnavailable,
  onMarkColUnavailable,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/[0.08]">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-black/[0.02]">
            {/* Top-left corner: Color \ Size label */}
            <th className={`${MONO_LABEL} w-28 border-r border-black/[0.06] px-3 py-2 text-left text-black/40`}>
              Color \ Size
            </th>

            {/* X-axis: sizes as column headers */}
            {sizes.map((size) => (
              <th
                key={size}
                className={`${MONO_LABEL} min-w-[120px] px-2 py-2 text-left text-black/55`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="truncate">{size}</span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onMarkColUnavailable(size)}
                    title={`Mark all ${size} as N/A`}
                    className="shrink-0 rounded px-1 py-0.5 text-[11px] text-black/25 transition-colors hover:bg-red-50 hover:text-red-400 disabled:opacity-30"
                  >
                    N/A↓
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Y-axis: colors as row headers */}
          {colors.map((color) => (
            <tr key={color} className="group border-t border-black/[0.05]">
              {/* Row header: color label + row N/A action */}
              <td className="border-r border-black/[0.06] px-3 py-1">
                <div className="flex items-center justify-between gap-1.5">
                  <span className={`${MONO_LABEL} font-medium text-black/70`}>{color}</span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onMarkRowUnavailable(color)}
                    title={`Mark all ${color} as N/A`}
                    className="rounded px-1 py-0.5 text-[11px] text-black/25 opacity-0 transition-colors group-hover:opacity-100 hover:bg-red-50 hover:text-red-400 disabled:opacity-30"
                  >
                    N/A→
                  </button>
                </div>
              </td>

              {/* Data cells: iterate sizes across the row */}
              {sizes.map((size) => {
                const key  = cellKey(size, color)
                const cell = cells[key]
                return (
                  <td key={size} className="p-1">
                    {cell ? (
                      <MatrixCellInput
                        cell={cell}
                        disabled={disabled}
                        onChange={(updates) => onCellChange(key, updates)}
                      />
                    ) : (
                      <div className="min-h-[40px]" />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
