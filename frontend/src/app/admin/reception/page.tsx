import { redirect } from 'next/navigation'
import { getAdminRole } from '@/lib/auth'
import { ReceptionDesk } from './ReceptionDesk'

export const metadata = { title: { absolute: 'OtahuhuPrintingShop · 接待工作台' } }

export default async function ReceptionPage() {
  if (await getAdminRole() !== 'Admin') redirect('/admin')
  return <ReceptionDesk />
}
