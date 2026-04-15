import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-black/[0.12] bg-black/[0.02] px-6 py-16 text-center">
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white border border-black/[0.08]">
          {icon}
        </div>
      )}
      <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
