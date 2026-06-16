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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get(COOKIE_NAME)?.value

  // Authenticated user visits /admin/login → send them to /admin
  if (pathname === LOGIN_PATH) {
    if (token) {
      return NextResponse.redirect(new URL('/admin', req.url))
    }
    return NextResponse.next()
  }

  // No token → redirect to login without a reason (user may never have logged in)
  if (!token) {
    const returnUrl = sanitizeReturnUrl(pathname)
    const loginUrl = new URL(LOGIN_PATH, req.url)
    loginUrl.searchParams.set('returnUrl', returnUrl)
    return NextResponse.redirect(loginUrl)
  }

  // Token present but JWT is expired → redirect with session-expired reason
  const exp = decodeJwtExp(token)
  if (exp !== null && exp < Math.floor(Date.now() / 1000)) {
    const returnUrl = sanitizeReturnUrl(pathname)
    const loginUrl = new URL(LOGIN_PATH, req.url)
    loginUrl.searchParams.set('reason', 'session-expired')
    loginUrl.searchParams.set('returnUrl', returnUrl)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Matches /admin, /admin/login, /admin/orders, /admin/products/123, etc.
  matcher: ['/admin/:path*'],
}
