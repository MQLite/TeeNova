import { brandName } from '@/lib/site-brand'

/**
 * The current public mark (Jira 10307).
 *
 * **No new logo was created.** The glyph below is byte-for-byte the printer path
 * that `Header.tsx` and `Footer.tsx` already drew inline; this component only
 * moves the two copies into one place so an approved logo is a one-file swap
 * (Jira 10300 §14.6, approval A34).
 *
 * Not done here, and not to be done without owner approval: redrawing the mark,
 * combining "Otahuhu Print" with "Quality Canvas Ltd", adding a trademark
 * symbol, or attaching a slogan. The wordmark is plain configured text
 * (`brandName`), not a designed lockup.
 */

export function BrandGlyph({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 9V3h12v6M6 18H4a1 1 0 01-1-1v-5a2 2 0 012-2h14a2 2 0 012 2v5a1 1 0 01-1 1h-2M8 14h8v7H8v-7z" />
    </svg>
  )
}

interface BrandMarkProps {
  /** `dark` renders the badge on light chrome; `light` on the black footer. */
  tone?: 'dark' | 'light'
  className?: string
}

export function BrandMark({ tone = 'dark', className = '' }: BrandMarkProps) {
  const dark = tone === 'dark'
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill ${
          dark ? 'bg-surface-inverse text-ink-inverse' : 'bg-white/10 text-ink-inverse'
        }`}
      >
        <BrandGlyph />
      </span>
      <span
        className={`text-base font-semibold tracking-[-0.02em] ${
          dark ? 'text-ink' : 'text-ink-inverse'
        }`}
      >
        {brandName}
      </span>
    </span>
  )
}
