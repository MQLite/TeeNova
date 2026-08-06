import type { Metadata } from 'next'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { QuoteLink } from '@/components/QuoteLink'

/**
 * Site-wide 404 (Jira 10307).
 *
 * Next served its unstyled default page for every unknown route, outside the
 * site chrome. This is the same visual language as `products/[id]/not-found.tsx`
 * and the shared `EmptyState`: a neutral "we could not find this" treatment,
 * clearly distinct from the red error treatment used when something failed.
 *
 * SEO (Jira 10308): the primary and sufficient control is the response itself —
 * Next serves this page with a real HTTP 404, which no search engine indexes. No
 * canonical is emitted (a 404 has no canonical URL) and no structured data of any
 * kind: describing a missing page as a Product, Service or FAQ would be a claim
 * about content that is not there. The `robots` export below is belt-and-braces
 * for any consumer that reads the document without checking the status line.
 */
export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <div className="section-container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
        <Icon name="search" />
      </span>
      <h1 className="display-page">We couldn’t find that page</h1>
      <p className="max-w-measure text-base leading-relaxed text-ink-muted">
        The link may be out of date, or the page may have moved. Browse our products and services, or
        get in touch about a print job.
      </p>
      <div className="mt-2 flex min-w-0 flex-wrap justify-center gap-3">
        <Link href="/products" className="btn-black">
          Browse Products
        </Link>
        <Link href="/services" className="btn-glass">
          Printing Services
        </Link>
        <QuoteLink source="/404" className="btn-glass">
          Request a Quote
        </QuoteLink>
      </div>
    </div>
  )
}
