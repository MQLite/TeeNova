import type { Metadata } from 'next'
import { getAdminRole } from '@/lib/auth'
import RuntimeModeStatusClient from './RuntimeModeStatusClient'

export const metadata: Metadata = { title: 'Runtime Mode · Payment Settings' }

// Server component: reads the admin role from the HttpOnly token. The runtime page is read-only for
// every role — the role is passed only so the layout/auth behaviour is consistent with the other pages.
export default function RuntimeModeStatusPage() {
  const role = getAdminRole() ?? undefined
  return <RuntimeModeStatusClient role={role} />
}
