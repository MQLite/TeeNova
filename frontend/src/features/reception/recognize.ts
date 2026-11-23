import {
  createAiOrderImport, getAiOrderImport, getAiOrderRecognitionOptions,
  startAiOrderRecognition, uploadAiOrderSource,
} from '@/api/ai-order-imports'
import { adminApiClient } from '@/lib/admin-client'
import type { Worksheet } from './worksheet'

// Keep these keys for this exact drawing so a lost response can be retried safely.
export interface CaptureRequest {
  key: string
  file: File
  importId?: string
  recognitionKey?: string
  retryAttempt?: number
}

export async function recognizeCapture(job: CaptureRequest, signal: AbortSignal, progress: (text: string) => void) {
  const options = await getAiOrderRecognitionOptions()
  const provider = options.providers.find(p => p.id.toLowerCase() === 'openai')
  const model = provider?.models.find(m => m.supportsImages)
  if (!options.recognitionEnabled || !provider || !model) throw new Error('当前没有启用 OpenAI 图片模型，可以直接填写工作单。')
  signal.throwIfAborted()
  progress('正在保存手稿…')
  if (!job.importId) job.importId = (await createAiOrderImport('create-' + job.key, job.key, true)).id
  let record = await getAiOrderImport(job.importId)
  signal.throwIfAborted()
  if (!record.sourceDocumentCount) {
    await uploadAiOrderSource(job.importId, job.file, 'Upload', 'source-' + job.key, () => {})
  }
  signal.throwIfAborted()
  if (record.status === 'Uploaded' || record.status === 'Failed') {
    if (record.status === 'Failed' && !record.recognition?.isRetryable) throw new Error('此次识别失败，可以对照原稿填写。')
    const attempt = record.recognition?.attemptNumber ?? 0
    if (job.retryAttempt !== attempt) {
      job.recognitionKey = 'recognize-' + crypto.randomUUID()
      job.retryAttempt = attempt
    }
    await startAiOrderRecognition(job.importId, provider.id, model.id, job.recognitionKey!, record.status === 'Failed')
  }
  progress('正在识别手稿…')
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    record = await getAiOrderImport(job.importId)
    if (record.status === 'NeedsReview' || record.status === 'Draft') {
      const draft = await adminApiClient.get<Omit<Worksheet, 'pickupDate'> & { pickupDate: string | null }>(
        '/api/admin/reception-sheets/recognition/' + job.importId, undefined, { signal },
      )
      return { ...draft, pickupDate: draft.pickupDate ?? '' }
    }
    if (record.status === 'Failed' || record.status === 'Cancelled') throw new Error('识别未完成，可以重试或手动填写。')
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  throw new Error('识别仍在后台运行。再次点击识别可查看结果，也可以手动填写。')
}
