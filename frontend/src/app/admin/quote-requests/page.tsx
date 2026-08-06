import { getAdminRole } from '@/lib/auth'
import { QuoteRequestListClient } from './QuoteRequestListClient'

export default function QuoteRequestsPage() {
  return <QuoteRequestListClient role={getAdminRole() ?? undefined} />
}
