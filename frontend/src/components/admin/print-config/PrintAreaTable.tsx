'use client'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/admin/EmptyState'
import type { PrintArea } from '@/types'

interface Props {
  areas: PrintArea[]
  onEdit: (area: PrintArea) => void
  onDeactivate: (area: PrintArea) => void
  onReactivate: (area: PrintArea) => void
}

export function PrintAreaTable({ areas, onEdit, onDeactivate, onReactivate }: Props) {
  if (areas.length === 0) {
    return (
      <EmptyState
        title="No print areas"
        description="Add a print area to get started."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-black/[0.08] bg-white">
      <table className="min-w-full divide-y divide-black/[0.06]">
        <thead className="bg-black/[0.02]">
          <tr>
            {['Name', 'Code', 'Base Price', 'Sort', 'Legacy', 'Status', ''].map((h) => (
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
          {areas.map((area) => (
            <tr key={area.id} className="group">
              <td className="px-4 py-3 text-sm text-black" style={{ letterSpacing: '-0.14px' }}>
                {area.name}
              </td>
              <td className="px-4 py-3">
                <span className="font-mono text-[11px] text-black/55">{area.code}</span>
              </td>
              <td className="px-4 py-3 text-sm text-black/75">
                ${area.basePrice.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-sm text-black/55">{area.sortOrder}</td>
              <td className="px-4 py-3">
                {area.legacyPositionValue != null ? (
                  <span className="font-mono text-[11px] text-black/40">{area.legacyPositionValue}</span>
                ) : (
                  <span className="text-black/25">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge color={area.isActive ? 'green' : 'gray'}>
                  {area.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button variant="white" size="sm" onClick={() => onEdit(area)}>
                    Edit
                  </Button>
                  {area.isActive ? (
                    <Button variant="ghost" size="sm" onClick={() => onDeactivate(area)}>
                      Deactivate
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => onReactivate(area)}>
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
