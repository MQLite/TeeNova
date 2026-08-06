import { getAdminRole } from '@/lib/auth'
import { QuoteRequestDetailClient } from './QuoteRequestDetailClient'

export default function QuoteRequestDetailPage() {
  return <QuoteRequestDetailClient role={getAdminRole() ?? undefined} />
}
