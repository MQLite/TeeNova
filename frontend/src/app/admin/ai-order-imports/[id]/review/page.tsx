import { redirect } from 'next/navigation'
import { getAdminRole } from '@/lib/auth'
import { AiOrderReviewWorkspace } from './AiOrderReviewWorkspace'

export const metadata = { title: 'AI Order Review' }

export default async function AiOrderReviewPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (await getAdminRole() !== 'Admin') redirect('/admin')
  return <AiOrderReviewWorkspace importId={params.id} />
}
