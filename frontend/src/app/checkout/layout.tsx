import type { Metadata } from 'next'
import { transactionalMetadata } from '@/lib/seo/metadata'

/**
 * Metadata boundary for `/checkout` and its `success` / `cancel` children (Jira 10308 Phase 3).
 *
 * All three pages are client components and cannot export `metadata` themselves. This layout adds
 * the directive and nothing else — no wrapper markup, no provider, no change to the checkout or
 * payment flow.
 *
 * `noindex, nofollow` with no canonical: these pages are per-visitor, and the success and cancel
 * pages carry an order reference. As with `/cart` the route stays crawlable in `robots.txt` so the
 * directive is actually read.
 */
export const metadata: Metadata = transactionalMetadata(
  'Checkout',
  'Complete your print order.',
)

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
