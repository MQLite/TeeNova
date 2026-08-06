import { describe, expect, it, vi } from 'vitest'
import { makeAdminQuoteRequestsApi, makeQuoteRequestsApi } from './quote-requests'

describe('quote request API contracts', () => {
  it('uses the dedicated anonymous upload and submit paths', async () => {
    const client = { uploadFile: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({}) }
    const api = makeQuoteRequestsApi(client as never)
    const file = new File(['x'], 'art.pdf')
    await api.upload(file); await api.create({} as never)
    expect(client.uploadFile).toHaveBeenCalledWith('/api/quote-requests/attachments', file)
    expect(client.post).toHaveBeenCalledWith('/api/quote-requests', {})
  })
  it('keeps admin operations on the authenticated client and has no convert-to-order call', () => {
    const client = { get: vi.fn(), post: vi.fn() }
    const api = makeAdminQuoteRequestsApi(client as never)
    api.markReviewed('q1'); api.cancel('q1'); api.markSpam('q1'); api.resend('q1', 'internal')
    expect(client.post.mock.calls.map((call) => call[0])).toEqual([
      '/api/quote-requests/q1/mark-reviewed', '/api/quote-requests/q1/cancel',
      '/api/quote-requests/q1/mark-spam', '/api/quote-requests/q1/resend-notification',
    ])
    expect(JSON.stringify(client.post.mock.calls)).not.toContain('convert-to-order')
  })
  it('uses a same-origin authenticated download route', () => {
    const api = makeAdminQuoteRequestsApi({ get: vi.fn(), post: vi.fn() } as never)
    expect(api.attachmentDownloadUrl('q1', 'a1')).toBe('/api/admin/quote-requests/q1/attachments/a1')
  })
})
