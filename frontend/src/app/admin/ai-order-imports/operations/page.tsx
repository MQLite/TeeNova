import { redirect } from 'next/navigation'
import { getAdminRole } from '@/lib/auth'
import { AiOrderOperationsClient } from './AiOrderOperationsClient'

export const metadata = { title: 'AI Order Operations' }

export default async function AiOrderOperationsPage() {
  if (await getAdminRole() !== 'Admin') redirect('/admin')
  return <AiOrderOperationsClient />
}
