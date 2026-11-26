import { beforeEach, expect, it, vi } from 'vitest'
import * as api from '@/api/ai-order-imports'
import { ensureMaterialSources, fallbackMaterialLimits, materialValidation, newMaterialItems, recognizeMaterials, type MaterialsJob } from './materials'
import { adminApiClient } from '@/lib/admin-client'

vi.mock('@/api/ai-order-imports', () => ({
  createAiOrderImport: vi.fn(), getAiOrderImport: vi.fn(), uploadAiOrderSource: vi.fn(),
  getAiOrderRecognitionOptions: vi.fn(), startAiOrderRecognition: vi.fn(),
}))
vi.mock('@/lib/admin-client', () => ({ adminApiClient: { get: vi.fn() } }))

beforeEach(() => vi.resetAllMocks())

it('accepts mixed files with equal names and checks the confirmed count and byte limits', () => {
  const pdf = new File(['pdf'], 'fit.pdf')
  const csv = new File(['Colour,Size'], 'size.csv', { type: 'application/vnd.ms-excel' })
  const second = new File(['Black,M'], 'size.csv')
  const ignored = new File(['spreadsheet'], 'order.xlsx')
  const result = newMaterialItems([pdf, csv, second, ignored], [], fallbackMaterialLimits)
  expect(result.items.map(item => [item.name, item.contentType])).toEqual([
    ['fit.pdf', 'application/pdf'], ['size.csv', 'text/csv'], ['size.csv', 'text/csv'],
  ])
  expect(new Set(result.items.map(item => item.key)).size).toBe(3)
  expect(result.errors).toContainEqual(expect.stringMatching(/order\.xlsx.*PDF.*CSV/))
  expect(newMaterialItems([pdf], [], { ...fallbackMaterialLimits, maxFileBytes: 2 }).errors[0]).toMatch(/fit\.pdf/)
  expect(materialValidation(result.items, '', { ...fallbackMaterialLimits, maxTextBytes: 2 })).toMatch(/size\.csv/)
})

it('refreshes a previously failed batch after acknowledging a retry', async () => {
  const files = [new File(['A'], 'first.csv')]
  const job: MaterialsJob = { key: 'batch', items: newMaterialItems(files, [], fallbackMaterialLimits).items, description: '',
    source: { importId: 'saved', documentIds: ['a'], description: '' } }
  vi.mocked(api.getAiOrderRecognitionOptions).mockResolvedValue({ recognitionEnabled: true, providers: [{
    id: 'openai', displayName: 'OpenAI', models: [{ id: 'text-model', displayName: 'Text', supportsImages: false, supportsPdf: false }],
  }] })
  vi.mocked(api.getAiOrderImport)
    .mockResolvedValueOnce({ status: 'Failed', recognition: { attemptNumber: 1, isRetryable: true } } as api.AiOrderImport)
    .mockResolvedValueOnce({ status: 'NeedsReview' } as api.AiOrderImport)
  vi.mocked(adminApiClient.get).mockResolvedValue({ customer: 'Xu', pickupDate: null })
  await expect(recognizeMaterials(job, new AbortController().signal, vi.fn(), vi.fn())).resolves.toMatchObject({ customer: 'Xu' })
  expect(api.startAiOrderRecognition).toHaveBeenCalledWith('saved', 'openai', 'text-model', expect.any(String), true, false)
})

it('resumes the failed file by its own upload key and sends the supplement after all originals', async () => {
  const files = ['A', 'B'].map(value => new File([value], 'shirt.csv', { type: 'text/csv' }))
  const job: MaterialsJob = { key: 'batch', items: newMaterialItems(files, [], fallbackMaterialLimits).items, description: 'M 改为 10' }
  vi.mocked(api.createAiOrderImport).mockResolvedValue({ id: 'batch-id' } as Awaited<ReturnType<typeof api.createAiOrderImport>>)
  vi.mocked(api.uploadAiOrderSource)
    .mockResolvedValueOnce({ document: { id: 'a' } } as api.AiOrderSourceUploadResult)
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce({ document: { id: 'b' } } as api.AiOrderSourceUploadResult)
    .mockResolvedValueOnce({ document: { id: 'note' } } as api.AiOrderSourceUploadResult)
  await expect(ensureMaterialSources(job)).rejects.toThrow(/shirt\.csv.*network/)
  const saved = await ensureMaterialSources(job)
  expect(api.createAiOrderImport).toHaveBeenCalledWith('create-batch', 'batch', true, true)
  expect(api.createAiOrderImport).toHaveBeenCalledTimes(1)
  const calls = vi.mocked(api.uploadAiOrderSource).mock.calls
  expect(calls.map(call => call[1].name)).toEqual(['shirt.csv', 'shirt.csv', 'shirt.csv', '__reception_supplement.txt'])
  expect(calls[0][3]).not.toBe(calls[1][3])
  expect(calls[1][3]).toBe(calls[2][3])
  expect(saved).toEqual({ importId: 'batch-id', documentIds: ['a', 'b'], description: 'M 改为 10' })
})

it('selects a model capable of all materials and reuses a saved batch without transferring it again', async () => {
  const files = [new File(['pdf'], 'scan.pdf'), new File(['img'], 'print.webp')]
  const job: MaterialsJob = { key: 'batch', items: newMaterialItems(files, [], fallbackMaterialLimits).items, description: '',
    source: { importId: 'saved', documentIds: ['p', 'i'], description: '' } }
  vi.mocked(api.getAiOrderRecognitionOptions).mockResolvedValue({ recognitionEnabled: true, providers: [{
    id: 'openai', displayName: 'OpenAI', models: [
      { id: 'only-pdf', displayName: 'PDF', supportsImages: false, supportsPdf: true },
      { id: 'only-img', displayName: 'Image', supportsImages: true, supportsPdf: false },
      { id: 'both', displayName: 'Both', supportsImages: true, supportsPdf: true },
    ],
  }] })
  vi.mocked(api.getAiOrderImport)
    .mockResolvedValueOnce({ status: 'Uploaded' } as api.AiOrderImport)
    .mockResolvedValueOnce({ status: 'NeedsReview' } as api.AiOrderImport)
  vi.mocked(adminApiClient.get).mockResolvedValue({ customer: 'Xu', pickupDate: null,
    sourceNotes: [{ kind: 'conflict', field: 'pickupDate', references: [{ documentId: 'p', page: 2 }] }] })
  await expect(recognizeMaterials(job, new AbortController().signal, vi.fn(), vi.fn())).resolves.toMatchObject({
    customer: 'Xu', pickupDate: '', sourceNotes: [{ field: 'pickupDate' }],
  })
  expect(api.startAiOrderRecognition).toHaveBeenCalledWith('saved', 'openai', 'both', expect.any(String), false, false)
  expect(api.uploadAiOrderSource).not.toHaveBeenCalled()
})
