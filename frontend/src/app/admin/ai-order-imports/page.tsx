import { redirect } from 'next/navigation'
import { getAdminRole } from '@/lib/auth'
import { AiOrderImportListClient } from './AiOrderImportListClient'

export const metadata = { title: 'AI Order Imports' }

export default async function AiOrderImportsPage() {
  if (await getAdminRole() !== 'Admin') redirect('/admin')
  return <AiOrderImportListClient />
}
