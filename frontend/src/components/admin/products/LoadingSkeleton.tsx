import { SkeletonBlock } from '@/components/admin/LoadingSkeleton'

export function LoadingSkeleton({ mode = 'grid' }: { mode?: 'grid' | 'detail' }) {
  if (mode === 'detail') {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-8 w-64" />
            <SkeletonBlock className="h-4 w-40" />
          </div>
          <SkeletonBlock className="h-10 w-32 rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <SkeletonBlock className="h-[420px] rounded-[24px]" />
          <div className="space-y-4">
            <SkeletonBlock className="h-36 rounded-2xl" />
            <SkeletonBlock className="h-44 rounded-2xl" />
            <SkeletonBlock className="h-32 rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-black/[0.08] bg-white">
          <SkeletonBlock className="aspect-[4/3] w-full" />
          <div className="space-y-3 p-5">
            <SkeletonBlock className="h-5 w-2/3" />
            <SkeletonBlock className="h-4 w-24" />
            <div className="flex gap-2">
              <SkeletonBlock className="h-9 w-24 rounded-full" />
              <SkeletonBlock className="h-9 w-20 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
