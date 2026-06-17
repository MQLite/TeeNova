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

// Use a path-only Location header so the browser resolves the redirect against
// whichever origin it used (e.g. www.otahuhuprint.com), not the internal
// localhost address that req.url reflects when running behind a reverse proxy.
function relativeRedirect(path: string, status = 307): Response {
  return new Response(null, { status, headers: { Location: path } })
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get(COOKIE_NAME)?.value

  // Authenticated user visits /admin/login → send them to /admin
  if (pathname === LOGIN_PATH) {
    if (token) {
      return relativeRedirect('/admin')
    }
    return NextResponse.next()
  }

  // No token → redirect to login without a reason (user may never have logged in)
  if (!token) {
    const returnUrl = sanitizeReturnUrl(pathname)
    const params = new URLSearchParams({ returnUrl })
    return relativeRedirect(`${LOGIN_PATH}?${params}`)
  }

  // Token present but JWT is expired → redirect with session-expired reason
  const exp = decodeJwtExp(token)
  if (exp !== null && exp < Math.floor(Date.now() / 1000)) {
    const returnUrl = sanitizeReturnUrl(pathname)
    const params = new URLSearchParams({ reason: 'session-expired', returnUrl })
    return relativeRedirect(`${LOGIN_PATH}?${params}`)
  }

  return NextResponse.next()
}

export const config = {
  // Matches /admin, /admin/login, /admin/orders, /admin/products/123, etc.
  matcher: ['/admin/:path*'],
}
