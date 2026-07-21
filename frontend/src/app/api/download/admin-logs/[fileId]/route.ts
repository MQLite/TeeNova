import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'
import {
  type AdminLogDownloadErrorCode,
  isSafeFileId,
  mapDownloadFailure,
} from './download-bridge'

const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'https://localhost:44300'

const COOKIE_NAME = 'admin_token'
const MAX_ERROR_BODY_BYTES = 16 * 1024

const SAFE_RESPONSE_HEADERS = [
  'content-type',
  'content-disposition',
  'content-length',
  'cache-control',
  'x-content-type-options',
  'x-accel-buffering',
] as const

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
): Promise<NextResponse> {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token) return redirectToLogin(req)

  const { fileId } = await params
  if (!isSafeFileId(fileId)) {
    return redirectToLogs(req, 'file-unavailable')
  }

  const backendUrl = `${BACKEND_URL}/api/admin/logs/${encodeURIComponent(fileId)}/download`
  let backendResponse: Response
  try {
    backendResponse = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        // ABP's exception filter only serializes mapped BusinessException responses when
        // the request accepts JSON. Keep the stream media type first for successful files.
        Accept: 'application/octet-stream, application/json',
      },
      cache: 'no-store',
      signal: req.signal,
    })
  } catch {
    return redirectToLogs(req, 'download-failed')
  }

  if (!backendResponse.ok || backendResponse.status !== 200) {
    const backendCode = await readBoundedErrorCode(backendResponse)
    const safeCode = mapDownloadFailure(backendResponse.status, backendCode)
    if (safeCode === 'session-expired') return redirectToLogin(req)
    return redirectToLogs(req, safeCode)
  }

  if (!backendResponse.body) {
    return redirectToLogs(req, 'download-failed')
  }

  const headers = new Headers()
  for (const header of SAFE_RESPONSE_HEADERS) {
    const value = backendResponse.headers.get(header)
    if (value) headers.set(header, value)
  }
  if (!headers.has('content-type')) headers.set('content-type', 'application/octet-stream')
  if (!headers.has('content-disposition')) {
    headers.set('content-disposition', 'attachment; filename="server-log-download.log"')
  }
  if (!headers.has('x-content-type-options')) headers.set('x-content-type-options', 'nosniff')
  headers.set('cache-control', 'no-store')
  headers.delete('accept-ranges')

  return new NextResponse(backendResponse.body, {
    status: backendResponse.status,
    headers,
  })
}

async function readBoundedErrorCode(response: Response): Promise<string | null> {
  const reader = response.body?.getReader()
  if (!reader) return null

  const decoder = new TextDecoder()
  let decoded = ''
  let received = 0
  try {
    while (received < MAX_ERROR_BODY_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      const remaining = MAX_ERROR_BODY_BYTES - received
      const slice = value.byteLength > remaining ? value.subarray(0, remaining) : value
      received += slice.byteLength
      decoded += decoder.decode(slice, { stream: received < MAX_ERROR_BODY_BYTES })
      if (value.byteLength > remaining) break
    }
    decoded += decoder.decode()
  } catch {
    return null
  } finally {
    await reader.cancel().catch(() => undefined)
  }

  try {
    const payload = JSON.parse(decoded) as { error?: { code?: unknown } }
    return typeof payload.error?.code === 'string' ? payload.error.code : null
  } catch {
    return null
  }
}

function redirectToLogs(req: NextRequest, code: AdminLogDownloadErrorCode): NextResponse {
  const url = frontendUrl(req, '/admin/system/logs')
  url.searchParams.set('downloadError', code)
  return NextResponse.redirect(url, 303)
}

function redirectToLogin(req: NextRequest): NextResponse {
  const url = frontendUrl(req, '/admin/login')
  url.searchParams.set('reason', 'session-expired')
  url.searchParams.set('returnUrl', '/admin/system/logs')
  return NextResponse.redirect(url, 303)
}

function frontendUrl(req: NextRequest, pathname: string): URL {
  const host =
    req.headers.get('x-forwarded-host') ??
    req.headers.get('host') ??
    req.nextUrl.host
  const protocol =
    req.headers.get('x-forwarded-proto')?.split(',')[0].trim() ??
    req.nextUrl.protocol.replace(':', '')
  return new URL(`${protocol}://${host}${pathname}`)
}
