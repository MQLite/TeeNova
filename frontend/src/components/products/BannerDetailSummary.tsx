import {
  bannerFinishingSummary,
  bannerMaterialSummary,
  bannerSizeSummary,
  type BannerDetailLike,
} from '@/lib/banner-format'

interface Props {
  /** Order snapshot (`BannerDetail`) or config input (`BannerDetailInput`) — both satisfy BannerDetailLike. */
  detail?: BannerDetailLike | null
  /** Show the customer-facing subset only (hides nothing internal here, but kept for intent/clarity). */
  variant?: 'admin' | 'customer'
  className?: string
}

/**
 * Shared, null-safe Banner configuration summary (Jira 9514). Used by admin order detail and customer
 * tracking so converted Banner orders show dimensions/material/finishing consistently — never a fake
 * variant, print row, or Badge tier. Renders "Banner details unavailable" when the detail is missing.
 */
export function BannerDetailSummary({ detail, className }: Props) {
  if (!detail) {
    return (
      <p className={`text-xs text-ink-muted ${className ?? ''}`}>
        Banner details unavailable
      </p>
    )
  }

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Size', value: bannerSizeSummary(detail) },
    { label: 'Material', value: bannerMaterialSummary(detail) },
    { label: 'Finishing', value: bannerFinishingSummary(detail) },
  ]
  if (detail.notes?.trim()) rows.push({ label: 'Notes', value: detail.notes.trim() })

  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs ${className ?? ''}`}>
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="font-mono uppercase tracking-[0.4px] text-ink-muted">{r.label}</dt>
          <dd className="text-ink-secondary">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}
