import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from './middleware'

const HOST = 'staging.otahuhuprint.com'

// Minimal unsigned JWT — middleware reads the exp claim without verifying the signature.
function tokenExpiring(secondsFromNow: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow }))
    .toString('base64url')
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`
}

function request(pathname: string, token?: string): NextRequest {
  const headers = new Headers({ host: HOST, 'x-forwarded-proto': 'https' })
  if (token) headers.set('cookie', `admin_token=${token}`)
  return new NextRequest(`https://${HOST}${pathname}`, { headers })
}

function locationOf(res: Response): string | null {
  return res.headers.get('location')
}

describe('admin middleware', () => {
  it('sends an anonymous visitor to the login page with a return url', () => {
    const res = middleware(request('/admin/orders'))
    expect(res.status).toBe(307)
    expect(locationOf(res)).toBe(`https://${HOST}/admin/login?returnUrl=%2Fadmin%2Forders`)
  })

  it('lets a valid session through', () => {
    const res = middleware(request('/admin/orders', tokenExpiring(3600)))
    expect(locationOf(res)).toBeNull()
  })

  it('sends an expired session to the login page', () => {
    const res = middleware(request('/admin/orders', tokenExpiring(-60)))
    expect(res.status).toBe(307)
    expect(locationOf(res)).toContain('reason=session-expired')
  })

  it('bounces a valid session away from the login page', () => {
    const res = middleware(request('/admin/login', tokenExpiring(3600)))
    expect(res.status).toBe(307)
    expect(locationOf(res)).toBe(`https://${HOST}/admin`)
  })

  // Regression: an expired cookie used to be bounced off /admin/login on mere presence,
  // while /admin redirected it back — an infinite loop the user could not escape.
  it('does NOT redirect an expired session away from the login page', () => {
    const res = middleware(request('/admin/login', tokenExpiring(-60)))
    expect(locationOf(res)).toBeNull()
  })

  it('clears the stale cookie when serving the login page', () => {
    const res = middleware(request('/admin/login', tokenExpiring(-60)))
    expect(res.headers.get('set-cookie')).toMatch(/admin_token=;/)
  })

  // Regression: the backend can reject a token whose exp claim still looks valid (bad
  // signature, rotated Jwt:Secret, deactivated account). The server components then call
  // redirectToExpiredLogin(), and middleware used to bounce it straight back to /admin —
  // into the same 401 — looping until the browser gave up.
  it('does NOT redirect a backend-rejected session away from the login page', () => {
    const res = middleware(
      request('/admin/login?reason=session-expired&returnUrl=%2Fadmin', tokenExpiring(3600)),
    )
    expect(locationOf(res)).toBeNull()
    expect(res.headers.get('set-cookie')).toMatch(/admin_token=;/)
  })

  it('cannot loop between /admin and /admin/login for any token state', () => {
    const tokens = [undefined, tokenExpiring(-60), tokenExpiring(3600), 'not-a-jwt']
    for (const token of tokens) {
      // Both ways into the login page: middleware's own expiry redirect, and the
      // server-component 401 redirect that carries the same marker.
      for (const entry of [
        locationOf(middleware(request('/admin', token))),
        '/admin/login?reason=session-expired&returnUrl=%2Fadmin',
      ]) {
        if (!entry) continue
        const path = entry.startsWith('http') ? new URL(entry).pathname + new URL(entry).search : entry
        expect(locationOf(middleware(request(path, token)))).toBeNull()
      }
    }
  })
})
