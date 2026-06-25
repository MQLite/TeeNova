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
      <h2 className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
        Product details
      </h2>
      <p
        className={`mt-3 whitespace-pre-wrap text-sm leading-relaxed text-black/55 ${collapsed ? 'line-clamp-4' : ''}`}
        style={{ letterSpacing: '-0.14px', fontWeight: 400 }}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-3 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55 transition-colors hover:text-black"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </section>
  )
}
