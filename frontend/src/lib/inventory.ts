import type { InventoryStatus } from '@/types'

/**
 * Derives the informational inventory status from a quantity + optional threshold.
 * Mirrors the backend rule (NotRecorded when untracked; 0 → OutOfStock;
 * ≤ threshold → LowStock; otherwise InStock) so the matrix UI and server agree.
 */
export function deriveInventoryStatus(
  qty: number | null,
  threshold: number | null,
): InventoryStatus {
  if (qty == null) return 'NotRecorded'
  if (qty <= 0) return 'OutOfStock'
  if (threshold != null && qty <= threshold) return 'LowStock'
  return 'InStock'
}

interface StatusStyle {
  label: string
  dot: string
  pill: string
}

export const INVENTORY_STATUS_STYLE: Record<InventoryStatus, StatusStyle> = {
  NotRecorded: { label: 'Not Recorded', dot: 'bg-black/25',  pill: 'bg-black/[0.04] text-black/55' },
  InStock:     { label: 'In Stock',     dot: 'bg-green-500', pill: 'bg-green-50 text-green-700' },
  LowStock:    { label: 'Low Stock',    dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700' },
  OutOfStock:  { label: 'Out of Stock', dot: 'bg-red-500',   pill: 'bg-red-50 text-red-700' },
}

/** A non-negative integer, or empty string for "not recorded". Used to validate cell input. */
export function isValidQtyInput(raw: string): boolean {
  const t = raw.trim()
  return t === '' || /^\d+$/.test(t)
}
