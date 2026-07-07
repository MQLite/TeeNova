import type { Metadata } from 'next'
import { getAdminRole } from '@/lib/auth'
import PaymentSettingsClient from './PaymentSettingsClient'

export const metadata: Metadata = { title: 'Payment Settings' }

// Server component: reads the admin role from the HttpOnly token server-side and passes it to the client
// UI so write controls are hidden for Viewer. The API also enforces Admin-only writes server-side (403).
export default function PaymentSettingsPage() {
  const role = getAdminRole() ?? undefined
  return <PaymentSettingsClient role={role} />
}
