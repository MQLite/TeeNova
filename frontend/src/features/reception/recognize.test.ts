import { beforeEach, expect, it, vi } from 'vitest'
import * as api from '@/api/ai-order-imports'
import { ensureCaptureSource, recognizeCapture, recognizeReceptionImport, type CaptureRequest } from './recognize'
import { adminApiClient } from '@/lib/admin-client'

vi.mock('@/api/ai-order-imports', () => ({
  createAiOrderImport: vi.fn(), getAiOrderImport: vi.fn(), uploadAiOrderSource: vi.fn(),
  getAiOrderRecognitionOptions: vi.fn(), startAiOrderRecognition: vi.fn(),
}))
vi.mock('@/lib/admin-client', () => ({ adminApiClient: { get: vi.fn() } }))
beforeEach(() => vi.resetAllMocks())

it('uploads a camera photo once and returns the same private reference when saving again', async () => {
  vi.mocked(api.createAiOrderImport).mockResolvedValue({ id: 'import' } as Awaited<ReturnType<typeof api.createAiOrderImport>>)
  vi.mocked(api.getAiOrderImport).mockResolvedValue({ sourceDocuments: [] } as unknown as Awaited<ReturnType<typeof api.getAiOrderImport>>)
  vi.mocked(api.uploadAiOrderSource).mockResolvedValue({ document: { id: 'doc' } } as Awaited<ReturnType<typeof api.uploadAiOrderSource>>)
  const file = new File(['photo'], 'note.jpg', { type: 'image/jpeg' })
  const job: CaptureRequest = { key: 'capture', method: 'Camera', file }
  const ref = { importId: 'import', documentId: 'doc' }
  expect(await ensureCaptureSource(job)).toEqual(ref)
  expect(await ensureCaptureSource(job)).toEqual(ref)
  expect(api.uploadAiOrderSource).toHaveBeenCalledTimes(1)
  expect(api.uploadAiOrderSource).toHaveBeenCalledWith('import', file, 'Camera', 'source-capture', expect.any(Function))
})

it('uploads the exact multiline source once and reuses its private document on retry', async () => {
  const text = '客户更正\r\n黑T\tM\t10\n🧵'.padEnd(20_000, '衣')
  const job: CaptureRequest = { key: 'text-revision', text }
  vi.mocked(api.createAiOrderImport).mockResolvedValue({ id: 'import' } as Awaited<ReturnType<typeof api.createAiOrderImport>>)
  vi.mocked(api.getAiOrderImport).mockResolvedValue({ sourceDocuments: [] } as unknown as Awaited<ReturnType<typeof api.getAiOrderImport>>)
  vi.mocked(api.uploadAiOrderSource).mockResolvedValue({ document: { id: 'doc' } } as Awaited<ReturnType<typeof api.uploadAiOrderSource>>)
  const ref = await ensureCaptureSource(job)
  expect(await ensureCaptureSource(job)).toEqual(ref)
  expect(api.uploadAiOrderSource).toHaveBeenCalledTimes(1)
  const [, file, method, key] = vi.mocked(api.uploadAiOrderSource).mock.calls[0]
  expect([file.type, method, key]).toEqual(['text/plain', 'Upload', 'source-text-revision'])
  const uploadedText = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
  expect(uploadedText).toBe(text)
})

it.each([' \t\n', '🧵'.repeat(10_000) + 'x'])('rejects invalid text before creating an import', async text => {
  await expect(ensureCaptureSource({ key: 'invalid', text })).rejects.toThrow(/文字/)
  expect(api.createAiOrderImport).not.toHaveBeenCalled()
})

it('recognizes a saved text document with a configured text-only OpenAI model', async () => {
  vi.mocked(api.getAiOrderRecognitionOptions).mockResolvedValue({
    recognitionEnabled: true, providers: [{ id: 'openai', models: [{ id: 'text-model', supportsImages: false }] }],
  } as Awaited<ReturnType<typeof api.getAiOrderRecognitionOptions>>)
  vi.mocked(api.getAiOrderImport)
    .mockResolvedValueOnce({ status: 'Uploaded' } as Awaited<ReturnType<typeof api.getAiOrderImport>>)
    .mockResolvedValueOnce({ status: 'NeedsReview' } as Awaited<ReturnType<typeof api.getAiOrderImport>>)
  vi.mocked(adminApiClient.get).mockResolvedValue({ customer: 'Lee', pickupDate: null })
  const job = { key: 'saved', text: '黑T M 10', source: { importId: 'import', documentId: 'doc' } }
  await expect(recognizeCapture(job, new AbortController().signal, vi.fn())).resolves.toMatchObject({ customer: 'Lee' })
  expect(api.startAiOrderRecognition).toHaveBeenCalledWith('import', 'openai', 'text-model', expect.any(String), false, false)
})

it.each(['NeedsReview', 'Draft'] as const)('runs a fresh attempt for a %s source and reuses the key after a lost response', async status => {
  const job: CaptureRequest = {key: 'same-source'}
  const completed = {status, recognition: {attemptNumber: 1}} as api.AiOrderImport
  vi.mocked(api.getAiOrderImport).mockResolvedValue(completed)
  vi.mocked(api.startAiOrderRecognition).mockRejectedValueOnce(new Error('lost response'))
  vi.mocked(adminApiClient.get).mockResolvedValueOnce({customer: 'First'}).mockResolvedValueOnce({customer: 'Second'})
  const run = () => recognizeReceptionImport(job, 'import', {provider: 'openai', model: 'm'}, new AbortController().signal, vi.fn())
  await expect(run()).rejects.toThrow('lost response')
  await expect(run()).resolves.toMatchObject({customer: 'First'})
  await expect(run()).resolves.toMatchObject({customer: 'Second'})
  const [failed, retried, rerun] = vi.mocked(api.startAiOrderRecognition).mock.calls
  expect(retried).toEqual(failed)
  expect(rerun).toEqual(['import', 'openai', 'm', expect.any(String), false, true])
  expect(rerun[3]).not.toBe(retried[3])
})
