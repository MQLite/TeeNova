import { beforeEach, expect, it, vi } from 'vitest'
import * as api from '@/api/ai-order-imports'
import { ensureCaptureSource, type CaptureRequest } from './recognize'

vi.mock('@/api/ai-order-imports', () => ({
  createAiOrderImport: vi.fn(), getAiOrderImport: vi.fn(), uploadAiOrderSource: vi.fn(),
}))
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
