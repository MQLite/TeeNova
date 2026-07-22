import type { Metadata } from 'next'
import { getAdminRole } from '@/lib/auth'
import TestModeSettingsClient from './TestModeSettingsClient'

export const metadata: Metadata = { title: 'Stripe Test Mode · Payment Settings' }

// Server component: reads the admin role from the HttpOnly token server-side and passes it to the
// client so write controls are hidden for Viewer. The API also enforces Admin-only writes (403).
export default function TestModeSettingsPage() {
  const role = getAdminRole() ?? undefined
  return <TestModeSettingsClient role={role} />
}
