import { redirect } from 'next/navigation'
import { getAdminRole } from '@/lib/auth'
import { AiOrderImportListClient } from './AiOrderImportListClient'

export const metadata = { title: 'AI Order Imports' }

export default function AiOrderImportsPage() {
  if (getAdminRole() !== 'Admin') redirect('/admin')
  return <AiOrderImportListClient />
}
