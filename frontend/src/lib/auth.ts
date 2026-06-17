import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { makeApiClient } from './api-client'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://localhost:44300'

export function getAdminToken(): string | undefined {
  return cookies().get('admin_token')?.value
}

export function getAdminAuthHeaders(): Record<string, string> {
  const token = getAdminToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

// Decodes the JWT payload (server-side only) and returns the username from the `sub` claim.
// Does not verify the signature — middleware already guards access.
export function getAdminUsername(): string | null {
  const token = getAdminToken()
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

// Decodes the JWT payload and returns the role claim ("Admin" or "Viewer").
// JwtSecurityTokenHandler maps ClaimTypes.Role → "role" in the JWT output.
export function getAdminRole(): string | null {
  const token = getAdminToken()
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
    const role =
      payload.role ??
      payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role']
    return typeof role === 'string' ? role : null
  } catch {
    return null
  }
}

// Returns an api client configured with the admin Bearer token.
// Call inside an async server component or route handler — never on the client.
export function makeAdminApiClient() {
  return makeApiClient(BACKEND_URL, getAdminAuthHeaders())
}

// Server-component helper: redirect to login with session-expired reason.
// Call when a backend API returns 401 during an active admin session.
// Never call from client components — use redirectToLogin() from admin-client.ts instead.
export function redirectToExpiredLogin(returnUrl: string = '/admin'): never {
  const safe =
    typeof returnUrl === 'string' &&
    returnUrl.startsWith('/admin') &&
    returnUrl !== '/admin/login'
      ? returnUrl
      : '/admin'
  const params = new URLSearchParams({ reason: 'session-expired', returnUrl: safe })
  redirect(`/admin/login?${params.toString()}`)
}
