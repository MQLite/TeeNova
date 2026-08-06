import type { Metadata } from 'next'
import { transactionalMetadata } from '@/lib/seo/metadata'

/**
 * Metadata boundary for `/cart` (Jira 10308 Phase 3).
 *
 * The cart page is a client component and cannot export `metadata` itself, so the directive lives
 * in this layout. Nothing else about the route changes: no wrapper markup, no provider, no
 * behaviour — the layout renders its children unchanged.
 *
 * `noindex, nofollow`, and no canonical or Open Graph block: the page shows one visitor's basket,
 * so there is nothing to index and nothing to share. The route is deliberately left crawlable in
 * `robots.txt` — a disallowed URL is never fetched, so this directive would never be read, and the
 * cart *is* linked from the site header.
 */
export const metadata: Metadata = transactionalMetadata(
  'Your Cart',
  'Review the items in your cart before checkout.',
)

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
