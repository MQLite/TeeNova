'use client'

import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import type { Order } from '@/types'
import clsx from 'clsx'

type ChecklistKey =
  | 'isDesignReviewed'
  | 'isPrintPositionConfirmed'
  | 'isFileDownloaded'
  | 'isGarmentConfirmed'
  | 'isReadyToPrint'

interface ChecklistItemProps {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

export function ChecklistItem({ label, description, checked, disabled, onChange }: ChecklistItemProps) {
  return (
    <label className={clsx(
      'flex items-start gap-3 rounded-lg border p-3 transition-colors',
      checked ? 'border-black/15 bg-black/[0.03]' : 'border-black/[0.08] bg-white',
      disabled && 'cursor-not-allowed opacity-60',
    )}>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-black/20 text-black focus:ring-black/20"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <div className="min-w-0">
        <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>{label}</p>
        <p className="mt-0.5 text-xs text-black/50" style={{ letterSpacing: '-0.14px' }}>{description}</p>
      </div>
    </label>
  )
}

const ITEMS: Array<{ key: ChecklistKey; label: string; description: string }> = [
  { key: 'isDesignReviewed', label: 'Design reviewed', description: 'Artwork quality and composition have been checked.' },
  { key: 'isPrintPositionConfirmed', label: 'Print position confirmed', description: 'Placement and print areas are aligned with the order.' },
  { key: 'isFileDownloaded', label: 'File downloaded', description: 'The print file has been downloaded or staged for production.' },
  { key: 'isGarmentConfirmed', label: 'Garment / variant confirmed', description: 'Size, color, and garment selection have been verified.' },
  { key: 'isReadyToPrint', label: 'Ready to print', description: 'Final pre-production signoff has been recorded.' },
]

export function PreparationChecklist({
  order,
  saving,
  disabled = false,
  onChange,
}: {
  order: Order
  saving: boolean
  disabled?: boolean
  onChange: (payload: Pick<Order, ChecklistKey>) => void
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">Preparation Checklist</h2>
          <p className="mt-1 text-xs text-black/45" style={{ letterSpacing: '-0.14px' }}>
            Saved to the order so the current checklist stays in sync across workstations.
          </p>
        </div>
        {saving && (
          <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Saving</span>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        {disabled && (
          <p className="text-xs text-black/45" style={{ letterSpacing: '-0.14px' }}>
            Checklist is locked while the order is cancelled.
          </p>
        )}
        {ITEMS.map((item) => (
          <ChecklistItem
            key={item.key}
            label={item.label}
            description={item.description}
            checked={order[item.key]}
            disabled={saving || disabled}
            onChange={(checked) => onChange({ ...pickChecklist(order), [item.key]: checked })}
          />
        ))}
      </CardBody>
    </Card>
  )
}

function pickChecklist(order: Order): Pick<Order, ChecklistKey> {
  return {
    isDesignReviewed: order.isDesignReviewed,
    isPrintPositionConfirmed: order.isPrintPositionConfirmed,
    isFileDownloaded: order.isFileDownloaded,
    isGarmentConfirmed: order.isGarmentConfirmed,
    isReadyToPrint: order.isReadyToPrint,
  }
}
