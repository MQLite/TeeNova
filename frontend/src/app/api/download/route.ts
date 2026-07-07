import { type NextRequest, NextResponse } from 'next/server'

// Server-only backend origin (never sent to the browser). Design asset URLs are stored
// root-relative (/uploads/designs/…) against the backend, so this proxy must resolve them
// against the backend origin — the frontend origin has no /uploads tree.
const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'https://localhost:44300'

const UPLOADS_PREFIX = '/uploads/'

/**
 * Resolves the requested design URL to an absolute backend URL, or null if it is not an
 * allowed uploads path. Accepts:
 *   - root-relative uploads paths:  /uploads/designs/…   → prefixed with the backend origin
 *   - absolute URLs whose path is under /uploads/         → legacy data, used as-is
 * Anything else (arbitrary hosts/paths, non-http schemes) is rejected to avoid turning this
 * route into an open proxy / SSRF vector.
 */
function resolveDownloadTarget(raw: string): URL | null {
  // Root-relative uploads path — the common case for stored design assets.
  if (raw.startsWith(UPLOADS_PREFIX)) {
    try {
      return new URL(`${BACKEND_URL}${raw}`)
    } catch {
      return null
    }
  }

  // Absolute URL (legacy data). Must be http/https and point at an /uploads/ path.
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null
  if (!parsed.pathname.startsWith(UPLOADS_PREFIX)) return null
  return parsed
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 })
  }

  const targetUrl = resolveDownloadTarget(url)
  if (!targetUrl) {
    return new NextResponse('Invalid or forbidden url', { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(targetUrl, { cache: 'no-store' })
  } catch {
    // Backend unreachable / DNS / TLS failure — return a clean gateway error instead of an
    // unhandled throw (which surfaces to the user as a "Site unavailable" error page).
    return new NextResponse('Could not reach the file server', { status: 502 })
  }

  if (!upstream.ok) {
    return new NextResponse('Failed to fetch file', { status: upstream.status })
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'
  const pathParts = targetUrl.pathname.split('/')
  const fileName = decodeURIComponent(pathParts[pathParts.length - 1] ?? 'design')

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
