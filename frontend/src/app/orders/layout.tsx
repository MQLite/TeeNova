import type { Metadata } from 'next'
import { transactionalMetadata } from '@/lib/seo/metadata'

/**
 * Metadata boundary for `/orders/**` (Jira 10308 Phase 3).
 *
 * `noindex, nofollow`. An order page is addressed by a customer-specific reference and has no place
 * in a search index. This is discovery hygiene, not access control: the backend's authorization
 * rules are what protect the data, and they are unchanged.
 *
 * The child route already sets its own `title`, which wins over the default here.
 */
export const metadata: Metadata = transactionalMetadata(
  'Order',
  'Order details.',
)

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
