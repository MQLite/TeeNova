import { getAdminRole } from '@/lib/auth'
import { QuoteRequestDetailClient } from './QuoteRequestDetailClient'

export default async function QuoteRequestDetailPage() {
  return <QuoteRequestDetailClient role={(await getAdminRole()) ?? undefined} />
}
