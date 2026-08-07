import { getAdminRole } from '@/lib/auth'
import { QuoteRequestListClient } from './QuoteRequestListClient'

export default async function QuoteRequestsPage() {
  return <QuoteRequestListClient role={(await getAdminRole()) ?? undefined} />
}
