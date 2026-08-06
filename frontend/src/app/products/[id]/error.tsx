'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Recoverable product-route error (Jira 10304).
 *
 * The route previously collapsed *every* initial failure — including a global print-config failure —
 * into "Product not found", which told the customer something untrue and offered no way forward.
 * This boundary handles the temporary case only: a genuinely missing or non-public product is
 * resolved to a real 404 by the server component and rendered by `not-found.tsx` instead.
 *
 * `reset()` re-runs the server render, so Retry re-fetches the product without navigating away and
 * without losing the configuration the customer had built — that lives in `sessionStorage` and is
 * restored when the configurator mounts again.
 *
 * No exception message, stack or digest is shown: the copy is fixed, and the underlying error is
 * logged to the browser console only for local debugging.
 */
export default function ProductDetailError({ error, reset }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    // Development aid only. Nothing from `error` reaches the rendered output.
    console.error('Product detail route error', error)
  }, [error])

  useEffect(() => {
    // Move focus to the message so a keyboard or screen-reader user is not left on a stale control.
    // This runs only when the error boundary appears, never during a normal hydration pass.
    headingRef.current?.focus()
  }, [])

  return (
    <div className="section-container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <div role="alert" aria-live="assertive" className="flex flex-col items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-surface text-danger">
          <Icon name="warning" />
        </span>
        <h1 ref={headingRef} tabIndex={-1} className="display-sub outline-none">
          We couldn’t load this product
        </h1>
        <p className="max-w-measure text-sm text-ink-muted">
          This is a temporary problem on our side — the product itself is still there. Please try
          again in a moment.
        </p>
      </div>

      <div className="mt-2 flex min-w-0 flex-wrap justify-center gap-3">
        <button type="button" onClick={() => reset()} className="btn-black btn-sm">
          Try again
        </button>
        <Link href="/products" className="btn-glass btn-sm">
          Back to Products
        </Link>
        <Link href="/contact" className="btn-glass btn-sm">
          Contact Us
        </Link>
      </div>
    </div>
  )
}
