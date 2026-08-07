import { redirect } from 'next/navigation'
import { getAdminRole } from '@/lib/auth'
import { AiOrderImportIntakeClient } from './AiOrderImportIntakeClient'

export const metadata = { title: 'AI Order Import' }

export default async function AiOrderImportPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (await getAdminRole() !== 'Admin') redirect('/admin')
  return <AiOrderImportIntakeClient importId={params.id} />
}
