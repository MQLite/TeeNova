import { redirect } from 'next/navigation'
import { getAdminRole } from '@/lib/auth'
import { ReceptionDesk } from './ReceptionDesk'

export const metadata = { title: { absolute: 'OtahuhuPrintingShop · 接待工作台' } }

export default async function ReceptionPage({ searchParams }: { searchParams: Promise<{ sheet?: string }> }) {
  if (await getAdminRole() !== 'Admin') redirect('/admin')
  const { sheet } = await searchParams
  return <ReceptionDesk initialSheet={typeof sheet === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(sheet) ? sheet : undefined} />
}
