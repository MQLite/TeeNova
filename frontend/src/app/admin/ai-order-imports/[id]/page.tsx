import { redirect } from 'next/navigation'
import { getAdminRole } from '@/lib/auth'
import { AiOrderImportIntakeClient } from './AiOrderImportIntakeClient'

export const metadata = { title: 'AI Order Import' }

export default function AiOrderImportPage({ params }: { params: { id: string } }) {
  if (getAdminRole() !== 'Admin') redirect('/admin')
  return <AiOrderImportIntakeClient importId={params.id} />
}
