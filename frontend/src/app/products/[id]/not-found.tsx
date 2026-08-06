import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'

/**
 * Genuine missing-product response (Jira 10304).
 *
 * Reached only when the backend answered 404 — the product does not exist, or it is inactive and the
 * visitor is anonymous (the Jira 9808 redaction rule). Next.js serves this with a real HTTP 404
 * status, so crawlers are told the truth rather than being shown a soft 404.
 *
 * Deliberately carries no "try again" affordance: retrying cannot make a deleted or unpublished
 * product appear, and offering it would repeat the misleading behaviour this task removed. Temporary
 * failures land in `error.tsx` instead.
 */
export default function ProductNotFound() {
  return (
    <div className="section-container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
      {/* A different glyph and a neutral (not red) treatment from `error.tsx`, so
          "this product is gone" and "we could not load it" are visually distinct
          — they call for different next steps. */}
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
        <Icon name="search" />
      </span>
      <h1 className="display-sub">This product isn’t available</h1>
      <p className="max-w-measure text-sm text-ink-muted">
        It may have been removed from the online catalogue or is no longer published. Browse our
        current products, or get in touch and we can still help with your print job.
      </p>
      <div className="mt-2 flex min-w-0 flex-wrap justify-center gap-3">
        <Link href="/products" className="btn-black btn-sm">
          Browse Products
        </Link>
        <Link href="/contact" className="btn-glass btn-sm">
          Contact Us
        </Link>
      </div>
    </div>
  )
}
