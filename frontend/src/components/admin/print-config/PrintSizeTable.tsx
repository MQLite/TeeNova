'use client'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/admin/EmptyState'
import type { PrintSize } from '@/types'

interface Props {
  sizes: PrintSize[]
  onEdit: (size: PrintSize) => void
  onDeactivate: (size: PrintSize) => void
  onReactivate: (size: PrintSize) => void
}

export function PrintSizeTable({ sizes, onEdit, onDeactivate, onReactivate }: Props) {
  if (sizes.length === 0) {
    return (
      <EmptyState
        title="No print sizes"
        description="Add a print size to get started."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-black/[0.08] bg-white">
      <table className="min-w-full divide-y divide-black/[0.06]">
        <thead className="bg-black/[0.02]">
          <tr>
            {['Name', 'Code', 'Base Price', 'Sort', 'Status', ''].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.06]">
          {sizes.map((size) => (
            <tr key={size.id} className="group">
              <td className="px-4 py-3 text-sm text-black" style={{ letterSpacing: '-0.14px' }}>
                {size.name}
              </td>
              <td className="px-4 py-3">
                <span className="font-mono text-[11px] text-black/55">{size.code}</span>
              </td>
              <td className="px-4 py-3 text-sm text-black/75">
                ${size.basePrice.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-sm text-black/55">{size.sortOrder}</td>
              <td className="px-4 py-3">
                <Badge color={size.isActive ? 'green' : 'gray'}>
                  {size.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button variant="white" size="sm" onClick={() => onEdit(size)}>
                    Edit
                  </Button>
                  {size.isActive ? (
                    <Button variant="ghost" size="sm" onClick={() => onDeactivate(size)}>
                      Deactivate
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => onReactivate(size)}>
                      Reactivate
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
