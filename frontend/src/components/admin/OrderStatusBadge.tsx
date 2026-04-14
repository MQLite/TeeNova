import clsx from 'clsx'
import type { OrderStatus } from '@/types'

interface StatusConfig {
  bg: string
  text: string
  dot: string
  label: string
}

const STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  Pending:      { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400',  label: 'Pending' },
  Confirmed:    { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500',   label: 'Confirmed' },
  InProduction: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500', label: 'In Production' },
  Shipped:      { bg: 'bg-sky-50',    text: 'text-sky-700',    dot: 'bg-sky-500',    label: 'Shipped' },
  Delivered:    { bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500',  label: 'Delivered' },
  Cancelled:    { bg: 'bg-red-50',    text: 'text-red-600',    dot: 'bg-red-400',    label: 'Cancelled' },
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
        'inline-flex items-center gap-1.5 rounded-full font-medium',
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
