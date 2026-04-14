import clsx from 'clsx'

interface SkeletonBlockProps {
  className?: string
}

export function SkeletonBlock({ className }: SkeletonBlockProps) {
  return (
    <div
      className={clsx(
        'animate-pulse rounded-lg bg-gray-200',
        className,
      )}
    />
  )
}

/** A row of skeleton cells — matches a table row layout */
export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      {Array.from({ length: cols }).map((_, i) => (
        <SkeletonBlock
          key={i}
          className={clsx(
            'h-4',
            i === 0 ? 'w-28' : i === cols - 1 ? 'w-16' : 'flex-1',
          )}
        />
      ))}
    </div>
  )
}

/** Full table-style loading state */
export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* fake header */}
      <div className="flex items-center gap-4 border-b border-gray-100 bg-gray-50 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBlock key={i} className={clsx('h-3', i === 0 ? 'w-24' : 'flex-1')} />
        ))}
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} cols={cols} />
        ))}
      </div>
    </div>
  )
}

/** Single card skeleton */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <SkeletonBlock className="mb-4 h-4 w-32" />
      <div className="space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonBlock key={i} className={clsx('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    </div>
  )
}
