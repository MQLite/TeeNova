import clsx from 'clsx'
import type { OrderStatus } from '@/types'

interface StatusConfig {
  bg: string
  text: string
  dot: string
  label: string
}

const STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  Pending:      { bg: 'bg-zinc-100',   text: 'text-zinc-700',   dot: 'bg-zinc-400',   label: 'Pending' },
  Cancelled:    { bg: 'bg-red-50',     text: 'text-red-600',    dot: 'bg-red-400',    label: 'Cancelled' },
  Paid:         { bg: 'bg-green-50',   text: 'text-green-700',  dot: 'bg-green-500',  label: 'Paid' },
  Reviewing:    { bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500',   label: 'Reviewing' },
  Printing:     { bg: 'bg-orange-50',  text: 'text-orange-700', dot: 'bg-orange-500', label: 'Printing' },
  Ready:        { bg: 'bg-teal-50',    text: 'text-teal-700',   dot: 'bg-teal-500',   label: 'Ready' },
  Completed:    { bg: 'bg-emerald-50', text: 'text-emerald-800',dot: 'bg-emerald-600',label: 'Completed' },
}

interface Props {
  status: OrderStatus
  size?: 'sm' | 'md'
  className?: string
}

export function OrderStatusBadge({ status, size = 'md', className }: Props) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.Pending
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-normal tracking-[0.02em]',
        cfg.bg, cfg.text,
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

export { STATUS_CONFIG }
