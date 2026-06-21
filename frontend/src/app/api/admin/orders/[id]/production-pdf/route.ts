// Dedicated authenticated download route for the admin order production PDF.
//
// The generic /api/proxy route is unsuitable here: it strips Content-Disposition and the
// typed admin client expects JSON. The public /api/download route adds no admin auth.
// So this route reads the HttpOnly admin_token cookie (same pattern as /api/proxy),
// calls the fixed backend PDF endpoint with a Bearer token, and returns the binary body
// while preserving Content-Type and Content-Disposition. The token never reaches the browser.
import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'https://localhost:44300'
const COOKIE_NAME = 'admin_token'

const FALLBACK_DISPOSITION = 'attachment; filename="order-production-sheet.pdf"'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ message: 'Missing order id.' }, { status: 400 })
  }

  const token = cookies().get(COOKIE_NAME)?.value
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  // Only ever call the fixed backend production-pdf route for this order id. The id is the
  // sole user-controlled value and is path-encoded; no user-provided URL/path is accepted.
  const backendUrl = `${BACKEND_URL}/api/orders/${encodeURIComponent(id)}/production-pdf`

  let backendRes: Response
  try {
    backendRes = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/pdf',
      },
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ message: 'Backend unreachable.' }, { status: 503 })
  }

  if (!backendRes.ok) {
    // Do not forward the backend body — it may contain error/stack-trace detail.
    // Surface the status only, with a generic message.
    return NextResponse.json(
      { message: 'Could not generate the production PDF.' },
      { status: backendRes.status },
    )
  }

  const body = await backendRes.arrayBuffer()
  const contentType = backendRes.headers.get('content-type') ?? 'application/pdf'
  const contentDisposition = backendRes.headers.get('content-disposition') ?? FALLBACK_DISPOSITION

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': contentDisposition,
      'Cache-Control': 'no-store',
    },
  })
}
