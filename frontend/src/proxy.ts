import { type NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'admin_token'
const LOGIN_PATH = '/admin/login'

function sanitizeReturnUrl(pathname: string): string {
  if (pathname.startsWith('/admin') && pathname !== LOGIN_PATH) {
    return pathname
  }
  return '/admin'
}

// Decodes the JWT exp claim without verifying the signature.
// Uses atob() because middleware runs in the Edge runtime where Buffer is unavailable.
// Returns null on any failure so the backend remains the source of truth.
function decodeJwtExp(token: string): number | null {
  try {
    const b64 = token.split('.')[1]
    if (!b64) return null
    // JWT uses base64url encoding — convert to standard base64 before atob()
    const std = b64.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(std)) as Record<string, unknown>
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

// A token counts as expired only when an exp claim is present and in the past.
// An undecodable token is NOT treated as expired — the backend stays the source of
// truth and rejects it — but it must be judged identically on every path here, or the
// login and protected branches can disagree and bounce the browser between them.
function isExpired(token: string): boolean {
  const exp = decodeJwtExp(token)
  return exp !== null && exp < Math.floor(Date.now() / 1000)
}

// Build an absolute redirect URL using the public hostname and scheme.
// req.nextUrl.host is always the internal bind address (127.0.0.1:3000) when Next.js
// is started with -H 127.0.0.1, so we must read the proxy headers directly.
// nginx forwards: "Host: www.otahuhuprint.com" and "X-Forwarded-Proto: https".
function buildRedirectUrl(req: NextRequest, pathname: string, params?: URLSearchParams): URL {
  const host =
    req.headers.get('x-forwarded-host') ??
    req.headers.get('host') ??
    req.nextUrl.host
  const proto =
    req.headers.get('x-forwarded-proto')?.split(',')[0].trim() ??
    req.nextUrl.protocol.replace(':', '')
  const url = new URL(`${proto}://${host}${pathname}`)
  if (params?.toString()) url.search = params.toString()
  return url
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get(COOKIE_NAME)?.value

  // Authenticated user visits /admin/login → send them to /admin.
  //
  // Two things must hold before bouncing them, or the browser ends up in an infinite
  // redirect (ERR_TOO_MANY_REDIRECTS) with no way to reach the form and re-authenticate:
  //
  //  1. The token must not be expired. An expired cookie is sent here by the branch below,
  //     so bouncing it back on mere presence ping-pongs.
  //  2. reason=session-expired must be absent. Only a rejected session lands here with that
  //     marker — the server components call redirectToExpiredLogin() when the BACKEND answers
  //     401. That happens for reasons this edge check cannot see (bad signature, rotated
  //     Jwt:Secret, deactivated account), so the exp claim can look perfectly valid while the
  //     backend refuses the token. Trusting exp alone would bounce them straight back into
  //     the 401 and loop.
  //
  // Either way the stale cookie is cleared as the form renders, so the state is self-healing.
  if (pathname === LOGIN_PATH) {
    const sessionRejected = req.nextUrl.searchParams.get('reason') === 'session-expired'
    if (token && !isExpired(token) && !sessionRejected) {
      return NextResponse.redirect(buildRedirectUrl(req, '/admin'))
    }
    const response = NextResponse.next()
    if (token) {
      response.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 })
    }
    return response
  }

  // No token → redirect to login without a reason (user may never have logged in)
  if (!token) {
    const returnUrl = sanitizeReturnUrl(pathname)
    const params = new URLSearchParams({ returnUrl })
    return NextResponse.redirect(buildRedirectUrl(req, LOGIN_PATH, params))
  }

  // Token present but JWT is expired → redirect with session-expired reason
  if (isExpired(token)) {
    const returnUrl = sanitizeReturnUrl(pathname)
    const params = new URLSearchParams({ reason: 'session-expired', returnUrl })
    return NextResponse.redirect(buildRedirectUrl(req, LOGIN_PATH, params))
  }

  return NextResponse.next()
}

export const config = {
  // Matches /admin, /admin/login, /admin/orders, /admin/products/123, etc.
  matcher: ['/admin/:path*'],
}
