'use client'

import { useState } from 'react'

interface Props {
  /** Free-form admin product description (whitespace preserved). */
  description: string | null
  className?: string
}

/** Above this length the description collapses behind a "Read more" toggle. */
const LONG_DESCRIPTION_THRESHOLD = 320

/**
 * Lower "Product details" section (Jira 9302): the long description moved out of the prime
 * above-the-fold card into a dedicated section below the purchase flow. Renders nothing when there
 * is no description (no invented shortDescription, no empty block). Long text is collapsible.
 */
export function ProductDetailsSection({ description, className }: Props) {
  const [expanded, setExpanded] = useState(false)

  const text = description ?? ''
  if (text.trim() === '') return null

  const isLong = text.length > LONG_DESCRIPTION_THRESHOLD
  const collapsed = isLong && !expanded

  return (
    <section className={`card p-6 ${className ?? ''}`}>
      <h2 className="text-sm text-ink" style={{ fontWeight: 500 }}>
        Product details
      </h2>
      <p
        className={`mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted ${collapsed ? 'line-clamp-4' : ''}`}
        style={{ fontWeight: 400 }}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-3 eyebrow text-ink-muted transition-colors hover:text-ink"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </section>
  )
}
