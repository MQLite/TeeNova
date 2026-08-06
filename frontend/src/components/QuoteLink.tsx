import Link from 'next/link'
import { quoteFormEnabled, quoteHref } from '@/lib/site-contact'

export function QuoteLink({ className, style, children, service, product, source }: {
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
  service?: string
  product?: string
  source?: string
}) {
  const href = quoteHref({ service, product, source })
  return quoteFormEnabled
    ? <Link href={href} className={className} style={style}>{children}</Link>
    : <a href={href} className={className} style={style}>{children}</a>
}
