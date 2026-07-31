import { redirect } from 'next/navigation'
import { getAdminRole } from '@/lib/auth'
import { AiOrderOperationsClient } from './AiOrderOperationsClient'

export const metadata = { title: 'AI Order Operations' }

export default function AiOrderOperationsPage() {
  if (getAdminRole() !== 'Admin') redirect('/admin')
  return <AiOrderOperationsClient />
}
