import type { Metadata } from 'next'
import { getAdminRole } from '@/lib/auth'
import PaymentSettingsOverviewClient from './PaymentSettingsOverviewClient'

export const metadata: Metadata = { title: 'Payment Settings' }

// Server component: reads the admin role from the HttpOnly token server-side and passes it to the
// read-only Overview client. Overview has no write controls; the dedicated Test/Live pages own all
// mutation. The API also enforces Admin-only writes server-side (403).
export default async function PaymentSettingsPage() {
  const role = (await getAdminRole()) ?? undefined
  return <PaymentSettingsOverviewClient role={role} />
}
