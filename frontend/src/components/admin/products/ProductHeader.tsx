import type { ReactNode } from 'react'

interface ProductHeaderProps {
  title: string
  subtitle?: string
  eyebrow?: string
  action?: ReactNode
}

export function ProductHeader({ title, subtitle, eyebrow, action }: ProductHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}
