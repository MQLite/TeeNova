// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { GET } from './route'
import { isSafeFileId, mapDownloadFailure } from './download-bridge'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))

const cookiesMock = vi.mocked(cookies)

function request(): NextRequest {
  return new NextRequest('https://internal:3000/api/download/admin-logs/id', {
    headers: {
      host: 'internal:3000',
      'x-forwarded-host': 'admin.example.test',
      'x-forwarded-proto': 'https',
    },
  })
}

function routeParams(fileId: string) {
  return { params: Promise.resolve({ fileId }) }
}

beforeEach(() => {
  cookiesMock.mockReturnValue({
    get: vi.fn().mockReturnValue({ value: 'server-only-admin-token' }),
  } as never)
  vi.stubGlobal('fetch', vi.fn())
})

describe('admin log streaming bridge', () => {
  it('rejects a missing session through the existing safe login flow', async () => {
    cookiesMock.mockReturnValue({ get: vi.fn().mockReturnValue(undefined) } as never)

    const response = await GET(request(), routeParams('opaque-id'))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      'https://admin.example.test/admin/login?reason=session-expired&returnUrl=%2Fadmin%2Fsystem%2Flogs',
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['', 'a'.repeat(2049), 'bad/id', 'bad\\id', 'bad\nid'])('rejects unsafe route ID %s', async fileId => {
    const response = await GET(request(), routeParams(fileId))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      'https://admin.example.test/admin/system/logs?downloadError=file-unavailable',
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('encodes the ID as one segment, adds server-side auth, propagates abort, and forwards the same stream', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.close()
      },
    })
    const upstream = new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="server.log"',
        'Content-Length': '3',
        'X-Content-Type-Options': 'nosniff',
        'X-Accel-Buffering': 'no',
        'Accept-Ranges': 'bytes',
        'Set-Cookie': 'unsafe=value',
        'X-Internal-Debug': 'do-not-forward',
      },
    })
    const arrayBufferSpy = vi.spyOn(upstream, 'arrayBuffer')
    const blobSpy = vi.spyOn(upstream, 'blob')
    const textSpy = vi.spyOn(upstream, 'text')
    vi.mocked(fetch).mockResolvedValue(upstream)
    const req = request()

    const response = await GET(req, routeParams('opaque-id_value'))

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://localhost:44300/api/admin/logs/opaque-id_value/download')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer server-only-admin-token')
    expect((init?.headers as Record<string, string>).Accept).toBe('application/octet-stream, application/json')
    expect(init?.signal).toBe(req.signal)
    expect(response.body).toBe(stream)
    expect(arrayBufferSpy).not.toHaveBeenCalled()
    expect(blobSpy).not.toHaveBeenCalled()
    expect(textSpy).not.toHaveBeenCalled()
    expect(response.headers.get('content-disposition')).toContain('server.log')
    expect(response.headers.get('content-length')).toBe('3')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-accel-buffering')).toBe('no')
    expect(response.headers.get('accept-ranges')).toBeNull()
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(response.headers.get('x-internal-debug')).toBeNull()
  })

  it('maps a bounded disabled error body to a fixed redirect without leaking its ID or message', async () => {
    const opaqueId = 'opaque-secret-id'
    vi.mocked(fetch).mockResolvedValue(Response.json({
      error: {
        code: 'TeeNova:AdminLogs:Disabled',
        message: 'raw /private/path detail',
      },
    }, { status: 503 }))

    const response = await GET(request(), routeParams(opaqueId))
    const location = response.headers.get('location') ?? ''

    expect(location).toBe('https://admin.example.test/admin/system/logs?downloadError=feature-disabled')
    expect(location).not.toContain(opaqueId)
    expect(location).not.toContain('private')
    expect(location).not.toContain('raw')
  })

  it('maps network failure to a fixed safe redirect', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('backend URL and path detail'))
    const response = await GET(request(), routeParams('opaque-id'))
    expect(response.headers.get('location')).toBe(
      'https://admin.example.test/admin/system/logs?downloadError=download-failed',
    )
  })

  it('fails closed on an unexpected partial response instead of adding range behavior', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1]), { status: 206 }))
    const response = await GET(request(), routeParams('opaque-id'))
    expect(response.headers.get('location')).toBe(
      'https://admin.example.test/admin/system/logs?downloadError=download-failed',
    )
  })

  it.each([
    [401, '', '/admin/login?reason=session-expired&returnUrl=%2Fadmin%2Fsystem%2Flogs'],
    [403, '', '/admin/system/logs?downloadError=forbidden'],
    [404, '', '/admin/system/logs?downloadError=file-unavailable'],
    [409, '', '/admin/system/logs?downloadError=file-changed'],
    [410, '', '/admin/system/logs?downloadError=file-expired'],
    [413, '', '/admin/system/logs?downloadError=file-too-large'],
    [503, '{"error":{"code":"TeeNova:AdminLogs:SourceUnavailable"}}', '/admin/system/logs?downloadError=source-unavailable'],
    [302, '<html>unsafe redirect</html>', '/admin/system/logs?downloadError=download-failed'],
    [500, '<html>raw backend path C:\\private</html>', '/admin/system/logs?downloadError=download-failed'],
    [500, '{malformed', '/admin/system/logs?downloadError=download-failed'],
    [500, '', '/admin/system/logs?downloadError=download-failed'],
  ])('maps backend status %s and an untrusted body to a fixed redirect', async (status, body, expectedPath) => {
    vi.mocked(fetch).mockResolvedValue(new Response(body, { status }))

    const response = await GET(request(), routeParams('opaque-secret-id'))
    const location = response.headers.get('location') ?? ''

    expect(location).toBe(`https://admin.example.test${expectedPath}`)
    expect(location).not.toContain('opaque-secret-id')
    expect(location).not.toContain('private')
    expect(location).not.toContain('unsafe')
  })

  it('bounds and cancels an oversized backend error body', async () => {
    let cancelled = false
    const errorBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(32 * 1024)))
      },
      cancel() {
        cancelled = true
      },
    })
    vi.mocked(fetch).mockResolvedValue(new Response(errorBody, { status: 500 }))

    const response = await GET(request(), routeParams('opaque-id'))

    expect(response.headers.get('location')).toBe(
      'https://admin.example.test/admin/system/logs?downloadError=download-failed',
    )
    expect(cancelled).toBe(true)
  })
})

describe('download bridge validation and status mapping', () => {
  it('accepts a bounded opaque value and rejects path/control forms', () => {
    expect(isSafeFileId('CfDJ8-safe_opaque-value')).toBe(true)
    expect(isSafeFileId('bad?query')).toBe(false)
    expect(isSafeFileId('bad#fragment')).toBe(false)
  })

  it.each([
    '../appsettings.json',
    '../../../../etc/passwd',
    '/etc/passwd',
    'C:\\Windows\\System32',
    'C:/Windows/System32',
    'filename.log/../../secret',
    'filename.log\0.txt',
    'file.log\r\nX-Test: injected',
    '.',
    '..',
    '/',
    '\\',
    ':',
    'file:stream',
    'bad?query=1',
    'bad#fragment',
    'opaque+id=value',
    'bad%2fid',
    'bad%252fid',
    'bad⁄id',
    'bad∕id',
    'bad／id',
  ])('rejects malicious browser route value %s', value => {
    expect(isSafeFileId(value)).toBe(false)
  })

  it.each([
    [401, null, 'session-expired'],
    [403, null, 'forbidden'],
    [404, null, 'file-unavailable'],
    [410, null, 'file-expired'],
    [409, null, 'file-changed'],
    [413, null, 'file-too-large'],
    [503, 'TeeNova:AdminLogs:Disabled', 'feature-disabled'],
    [503, 'TeeNova:AdminLogs:SourceUnavailable', 'source-unavailable'],
    [500, null, 'download-failed'],
  ])('maps %s to %s', (status, code, expected) => {
    expect(mapDownloadFailure(status, code)).toBe(expected)
  })
})
