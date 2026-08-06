import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'

const BACKEND_URL = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://localhost:44300'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; attachmentId: string } },
) {
  const token = cookies().get('admin_token')?.value
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  if (!/^[0-9a-f-]{36}$/i.test(params.id) || !/^[0-9a-f-]{36}$/i.test(params.attachmentId))
    return NextResponse.json({ message: 'Invalid attachment identifier.' }, { status: 400 })
  let response: Response
  try {
    response = await fetch(`${BACKEND_URL}/api/quote-requests/${params.id}/attachments/${params.attachmentId}/content`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    })
  } catch { return NextResponse.json({ message: 'Backend unreachable.' }, { status: 503 }) }
  if (!response.ok) return new NextResponse(await response.arrayBuffer(), { status: response.status, headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' } })
  return new NextResponse(response.body, { status: 200, headers: {
    'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream',
    'Content-Disposition': response.headers.get('content-disposition') ?? 'attachment',
    'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff',
  } })
}
