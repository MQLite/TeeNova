import type { ReactNode } from 'react'

type Color = 'gray' | 'green' | 'yellow' | 'red' | 'purple' | 'blue' | 'sky'

interface BadgeProps {
  color?: Color
  children: ReactNode
  className?: string
}

const colorClasses: Record<Color, string> = {
  gray:   'border border-black/[0.08] bg-black/[0.04] text-black/75',
  green:  'border border-green-200 bg-green-50 text-green-700',
  yellow: 'border border-amber-200 bg-amber-50 text-amber-700',
  red:    'border border-red-200 bg-red-50 text-red-700',
  purple: 'border border-violet-200 bg-violet-50 text-violet-700',
  blue:   'border border-blue-200 bg-blue-50 text-blue-700',
  sky:    'border border-sky-200 bg-sky-50 text-sky-700',
}

export function Badge({ color = 'gray', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.54px] ${colorClasses[color]} ${className}`}
    >
      {children}
    </span>
  )
}
