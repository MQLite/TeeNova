import {
  createAiOrderImport, getAiOrderImport, getAiOrderRecognitionOptions,
  startAiOrderRecognition, uploadAiOrderSource,
} from '@/api/ai-order-imports'
import { adminApiClient } from '@/lib/admin-client'
import type { Worksheet } from './worksheet'

export interface PhotoSource { importId: string; documentId: string }
export const MAX_RECEPTION_TEXT_LENGTH = 20_000

type RecognitionJob = { recognitionKey?: string; retryAttempt?: number }

export interface CaptureRequest extends RecognitionJob {
  key: string
  file?: File
  text?: string
  method?: 'Camera' | 'Upload'
  source?: PhotoSource
  importId?: string
}

export async function ensureCaptureSource(job: CaptureRequest, signal?: AbortSignal): Promise<PhotoSource> {
  if (job.source) return job.source
  let file = job.file
  if (job.text !== undefined) {
    if (!job.text.trim()) throw new Error('请先粘贴客户的订单文字。')
    if (job.text.length > MAX_RECEPTION_TEXT_LENGTH) throw new Error('文字超过 20,000 字符，请缩短后重试。')
    file = new File([job.text], 'reception.txt', { type: 'text/plain' })
  }
  if (!file) throw new Error('请重新选择接待原稿。')
  if (!job.importId) job.importId = (await createAiOrderImport('create-' + job.key, job.key, true)).id
  signal?.throwIfAborted()
  const record = await getAiOrderImport(job.importId)
  signal?.throwIfAborted()
  const document = record.sourceDocuments[0] ?? (await uploadAiOrderSource(
    job.importId, file, job.method ?? 'Upload', 'source-' + job.key, () => {},
  )).document
  job.source = { importId: job.importId, documentId: document.id }
  return job.source
}

export async function recognizeCapture(job: CaptureRequest, signal: AbortSignal, progress: (text: string) => void) {
  const isText = job.text !== undefined
  const selected = await receptionModel({ images: !isText, pdfs: false })
  if (!selected) {
    throw new Error(isText ? '当前没有启用 OpenAI 识别模型，可以直接填写工作单。' : '当前没有启用 OpenAI 图片模型，可以直接填写工作单。')
  }
  signal.throwIfAborted()
  progress(isText ? '正在保存文字原稿…' : '正在保存手稿…')
  const { importId } = await ensureCaptureSource(job, signal)
  return recognizeReceptionImport<Worksheet>(job, importId, selected, signal, () => progress(isText ? '正在识别文字原稿…' : '正在识别手稿…'))
}

export async function receptionModel({ images, pdfs }: { images: boolean; pdfs: boolean }) {
  const options = await getAiOrderRecognitionOptions()
  const provider = options.providers.find(p => p.id.toLowerCase() === 'openai')
  const models = provider?.models.filter(m => (!images || m.supportsImages) && (!pdfs || m.supportsPdf))
  const model = models?.find(m => m.id === 'gpt-6.2-sol') ?? models?.[0]
  return options.recognitionEnabled && provider && model ? { provider: provider.id, model: model.id } : undefined
}

export async function recognizeReceptionImport<T extends Worksheet>(job: RecognitionJob, importId: string,
  selected: { provider: string; model: string }, signal: AbortSignal, recognizing: () => void) {
  signal.throwIfAborted()
  let record = await getAiOrderImport(importId)
  signal.throwIfAborted()
  if (record.status === 'Uploaded' || record.status === 'Failed') {
    if (record.status === 'Failed' && !record.recognition?.isRetryable) throw new Error('此次识别失败，可以对照原稿填写。')
    const attempt = record.recognition?.attemptNumber ?? 0
    if (job.retryAttempt !== attempt) {
      job.recognitionKey = 'recognize-' + crypto.randomUUID()
      job.retryAttempt = attempt
    }
    await startAiOrderRecognition(importId, selected.provider, selected.model, job.recognitionKey!, record.status === 'Failed')
  }
  recognizing()
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    record = await getAiOrderImport(importId)
    signal.throwIfAborted()
    if (record.status === 'NeedsReview' || record.status === 'Draft') {
      const draft = await adminApiClient.get<Omit<T, 'pickupDate'> & { pickupDate: string | null }>(
        '/api/admin/reception-sheets/recognition/' + importId, undefined, { signal },
      )
      return { ...draft, pickupDate: draft.pickupDate ?? '' } as T
    }
    if (record.status === 'Failed' || record.status === 'Cancelled') throw new Error('识别未完成，可以重试或手动填写。')
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  throw new Error('识别仍在后台运行。再次点击识别可查看结果，也可以手动填写。')
}
