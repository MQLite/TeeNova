import { type NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 })
  }

  let targetUrl: URL
  try {
    targetUrl = new URL(url)
  } catch {
    return new NextResponse('Invalid url', { status: 400 })
  }

  // Block non-HTTP schemes (javascript:, data:, file:, etc.)
  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const upstream = await fetch(url, { cache: 'no-store' })
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
