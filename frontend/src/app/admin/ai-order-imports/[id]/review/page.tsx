import { redirect } from 'next/navigation'
import { getAdminRole } from '@/lib/auth'
import { AiOrderReviewWorkspace } from './AiOrderReviewWorkspace'

export const metadata = { title: 'AI Order Review' }

export default function AiOrderReviewPage({ params }: { params: { id: string } }) {
  if (getAdminRole() !== 'Admin') redirect('/admin')
  return <AiOrderReviewWorkspace importId={params.id} />
}
