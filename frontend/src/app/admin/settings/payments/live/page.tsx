import type { Metadata } from 'next'
import { getAdminRole } from '@/lib/auth'
import LiveModeSettingsClient from './LiveModeSettingsClient'

export const metadata: Metadata = { title: 'Stripe Live Mode · Payment Settings' }

// Server component: reads the admin role from the HttpOnly token server-side and passes it to the
// client. Live writes are additionally gated server-side by the unlock flag + confirmation phrase; the
// client mirrors those guards but the API is the authoritative boundary (Admin-only, 403 otherwise).
export default function LiveModeSettingsPage() {
  const role = getAdminRole() ?? undefined
  return <LiveModeSettingsClient role={role} />
}
