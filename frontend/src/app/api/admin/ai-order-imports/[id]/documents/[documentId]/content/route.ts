import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'https://localhost:44300'

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ id: string; documentId: string }> }
) {
  const params = await props.params;
  const token = (await cookies()).get('admin_token')?.value
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const id = encodeURIComponent(params.id)
  const documentId = encodeURIComponent(params.documentId)
  let response: Response
  try {
    response = await fetch(
      `${BACKEND_URL}/api/admin/ai-order-imports/${id}/documents/${documentId}/content`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      },
    )
  } catch {
    return NextResponse.json({ message: 'Backend unreachable.' }, { status: 503 })
  }

  if (!response.ok) {
    return NextResponse.json(
      { message: response.status === 404 ? 'Source document not found.' : 'Unable to open source document.' },
      { status: response.status },
    )
  }

  const headers = new Headers()
  for (const name of [
    'content-type',
    'content-length',
    'content-disposition',
    'content-security-policy',
    'x-content-type-options',
    'cross-origin-resource-policy',
  ]) {
    const value = response.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('Cache-Control', 'no-store, private')
  headers.set('Pragma', 'no-cache')
  headers.set('X-Content-Type-Options', 'nosniff')

  return new NextResponse(response.body, {
    status: 200,
    headers,
  })
}
