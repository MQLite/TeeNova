import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getAiOrderReview,
  saveAiOrderReview,
  searchAiOrderCatalogue,
  sourceContentUrl,
  startAiOrderRecognition,
  uploadAiOrderSource,
} from './ai-order-imports'

class SuccessfulUploadRequest {
  static latest: SuccessfulUploadRequest
  method?: string
  url?: string
  status = 201
  responseType = ''
  response = {
    document: { id: 'document-1' },
    wasIdempotentReplay: false,
    possibleMatchingImportIds: [],
  }
  headers = new Map<string, string>()
  upload: { onprogress?: (event: ProgressEvent) => void } = {}
  onerror?: () => void
  onload?: () => void

  constructor() {
    SuccessfulUploadRequest.latest = this
  }

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value)
  }

  send(body: FormData) {
    expect(body.get('file')).toBeInstanceOf(File)
    expect(body.get('captureMethod')).toBe('Camera')
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded: 5,
      total: 10,
    } as ProgressEvent)
    this.onload?.()
  }
}

describe('AI order import browser API', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses only the authorized identifier-based content bridge', () => {
    expect(sourceContentUrl('import-id', 'document-id')).toBe(
      '/api/admin/ai-order-imports/import-id/documents/document-id/content',
    )
  })

  it('sends a stable upload retry key and reports progress', async () => {
    vi.stubGlobal('XMLHttpRequest', SuccessfulUploadRequest)
    const progress = vi.fn()
    const file = new File(['jpeg-bytes'], 'page.jpg', { type: 'image/jpeg' })

    const result = await uploadAiOrderSource(
      'import-1',
      file,
      'Camera',
      'stable-retry-key',
      progress,
    )

    const request = SuccessfulUploadRequest.latest
    expect(request.method).toBe('POST')
    expect(request.url).toBe('/api/proxy/api/admin/ai-order-imports/import-1/documents')
    expect(request.headers.get('Upload-Idempotency-Key')).toBe('stable-retry-key')
    expect(progress).toHaveBeenNthCalledWith(1, 50)
    expect(progress).toHaveBeenLastCalledWith(100)
    expect(result.wasIdempotentReplay).toBe(false)
  })

  it('sends recognition through the same-origin proxy with its stable idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ attemptId: 'attempt-1', outcome: 'Processing' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await startAiOrderRecognition(
      'import-1',
      'openai',
      'gpt-5.4-nano',
      'stable-start-key',
    )

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/proxy/api/admin/ai-order-imports/import-1/recognition',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'stable-start-key',
        },
        body: JSON.stringify({ provider: 'openai', model: 'gpt-5.4-nano' }),
      }),
    )
  })

  it('uses the explicit retry route and never changes the selected model', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ attemptId: 'attempt-2', outcome: 'Processing' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await startAiOrderRecognition(
      'import-1',
      'claude',
      'claude-haiku-4-5-20251001',
      'retry-key',
      true,
    )

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/proxy/api/admin/ai-order-imports/import-1/recognition/retry',
    )
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({
      provider: 'claude',
      model: 'claude-haiku-4-5-20251001',
    }))
  })

  it('loads and saves Staff Review through the Admin proxy', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ importId: 'import-1', currentRevision: 4 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ importId: 'import-1', currentRevision: 5 }),
      })
    vi.stubGlobal('fetch', fetchMock)

    await getAiOrderReview('import-1')
    const save = {
      expectedRevision: 4,
      reviewVersion: 'ai-order-staff-review-v1' as const,
      customer: {
        name: { decision: 'Unresolved' as const },
        phone: { decision: 'Unresolved' as const },
        email: { decision: 'Unresolved' as const },
        organisation: { decision: 'Unresolved' as const },
        addressOrFulfilmentNotes: { decision: 'Unresolved' as const },
      },
      productGroups: [],
      financials: {
        orderTotal: { decision: 'Unresolved' as const },
        depositPaid: { decision: 'Unresolved' as const },
      },
      issueResolutions: [],
      operations: [],
    }
    await saveAiOrderReview('import-1', save)

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/proxy/api/admin/ai-order-imports/import-1/review',
    )
    expect(fetchMock.mock.calls[1][0]).toBe(
      '/api/proxy/api/admin/ai-order-imports/import-1/review',
    )
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify(save),
    }))
  })

  it('uses bounded server-side catalogue search rather than loading the catalogue', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await searchAiOrderCatalogue('import-1', 'TEE-BLK-M')

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/proxy/api/admin/ai-order-imports/import-1/review/catalogue?query=TEE-BLK-M',
    )
  })
})
