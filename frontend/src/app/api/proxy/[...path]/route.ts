// Catch-all proxy for admin API calls from client components.
// Reads the HttpOnly admin_token cookie, adds Authorization: Bearer header,
// and forwards the request to the backend. Returns 401 if no cookie is present.
import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'https://localhost:44300'
const COOKIE_NAME = 'admin_token'

async function proxyRequest(
  req: NextRequest,
  params: Promise<{ path: string[] }>,
): Promise<NextResponse> {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const { path } = await params
  const backendPath = '/' + path.join('/')
  const backendUrl = new URL(`${BACKEND_URL}${backendPath}`)

  // Forward query string
  req.nextUrl.searchParams.forEach((value, key) => {
    backendUrl.searchParams.set(key, value)
  })

  // Forward Content-Type (needed for multipart uploads to preserve boundary)
  const forwardHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  }
  const contentType = req.headers.get('content-type')
  if (contentType) forwardHeaders['Content-Type'] = contentType

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'

  let backendRes: Response
  try {
    backendRes = await fetch(backendUrl.toString(), {
      method: req.method,
      headers: forwardHeaders,
      body: hasBody ? req.body : undefined,
      // @ts-expect-error duplex is required for streaming body forwarding
      duplex: 'half',
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ message: 'Backend unreachable.' }, { status: 503 })
  }

  if (backendRes.status === 204) {
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  }

  const responseBody = await backendRes.arrayBuffer()
  const responseContentType = backendRes.headers.get('content-type') ?? 'application/json'

  return new NextResponse(responseBody, {
    status: backendRes.status,
    headers: { 'Content-Type': responseContentType, 'Cache-Control': 'no-store' },
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, params)
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, params)
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, params)
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, params)
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, params)
}
