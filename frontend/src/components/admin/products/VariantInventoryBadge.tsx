import type { InventoryStatus, ProductVariant } from '@/types'

interface BadgeStyle {
  label: string
  dot: string
  pill: string
}

const STATUS_STYLE: Record<InventoryStatus, BadgeStyle> = {
  NotRecorded: {
    label: 'Not Recorded',
    dot: 'bg-black/25',
    pill: 'bg-black/[0.04] text-black/55',
  },
  InStock: {
    label: 'In Stock',
    dot: 'bg-green-500',
    pill: 'bg-green-50 text-green-700',
  },
  LowStock: {
    label: 'Low Stock',
    dot: 'bg-amber-500',
    pill: 'bg-amber-50 text-amber-700',
  },
  OutOfStock: {
    label: 'Out of Stock',
    dot: 'bg-red-500',
    pill: 'bg-red-50 text-red-700',
  },
}

/**
 * Builds the human-readable detail suffix shown beside the status, e.g.
 * "Qty 25" or "Qty 2 / Threshold 5". Returns null when there is nothing to show
 * (NotRecorded, or a tracked status with a null quantity → status-only).
 */
function buildDetail(variant: ProductVariant): string | null {
  if (variant.inventoryStatus === 'NotRecorded') return null
  if (variant.stockQuantity == null) return null

  let detail = `Qty ${variant.stockQuantity}`
  if (variant.inventoryStatus === 'LowStock' && variant.lowStockThreshold != null) {
    detail += ` / Threshold ${variant.lowStockThreshold}`
  }
  return detail
}

interface Props {
  variant: ProductVariant
}

/** Read-only inventory status badge for a variant. Informational only. */
export function VariantInventoryBadge({ variant }: Props) {
  const style = STATUS_STYLE[variant.inventoryStatus] ?? STATUS_STYLE.NotRecorded
  const detail = buildDetail(variant)

  return (
    <span className="inline-flex items-center gap-1.5" style={{ letterSpacing: '-0.14px' }}>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] ${style.pill}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
        {style.label}
      </span>
      {detail && <span className="text-xs text-black/50">· {detail}</span>}
    </span>
  )
}
