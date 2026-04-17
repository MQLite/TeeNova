import type { ReactNode } from 'react'
import { EmptyState as BaseEmptyState } from '@/components/admin/EmptyState'

interface ProductEmptyStateProps {
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: ProductEmptyStateProps) {
  return (
    <BaseEmptyState
      icon={
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 text-black/45">
          <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4z" clipRule="evenodd" />
        </svg>
      }
      title={title}
      description={description}
      action={action}
    />
  )
}
