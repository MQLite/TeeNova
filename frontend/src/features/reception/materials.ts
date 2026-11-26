import { createAiOrderImport, sourceContentUrl, uploadAiOrderSource } from '@/api/ai-order-imports'
import { adminApiClient } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import { receptionModel, recognizeReceptionImport } from './recognize'
import type { Worksheet } from './worksheet'

const supplementName = '__reception_supplement.txt'
const formats: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
}

export const materialAccept = '.jpg,.jpeg,.png,.webp,.pdf,.txt,.csv'
export type MaterialLimits = { maxFileBytes: number; maxFiles: number; maxTotalBytes: number; maxPdfPages: number;
  maxDescriptionBytes: number; maxTextBytes: number; maxTextCharacters: number }
export const fallbackMaterialLimits: MaterialLimits = {
  maxFileBytes: 15 * 1024 * 1024, maxFiles: 12, maxTotalBytes: 16 * 1024 * 1024, maxPdfPages: 12,
  maxDescriptionBytes: 8_000, maxTextBytes: 60_000, maxTextCharacters: 20_000,
}
export const fetchMaterialLimits = (signal: AbortSignal) => adminApiClient.get<MaterialLimits>(
  '/api/admin/ai-order-imports/reception-batch-limits', undefined, { signal })

export type MaterialSource = { importId: string; documentIds: string[]; description: string }
export type MaterialMetadata = { id: string; name: string; contentType: string; pageCount?: number | null; expired: boolean; byteSize?: number }
export type SavedMaterials = MaterialSource & { files: MaterialMetadata[] }
export type MaterialItem = {
  key: string; name: string; contentType: string; method: 'Camera' | 'Upload'
  file?: File; saved?: MaterialMetadata & { importId: string }
}
export type MaterialStatus = { state: 'uploading'; percent: number } | { state: 'ready'; file: MaterialMetadata } | { state: 'failed'; message: string }
export type MaterialReference = { documentId: string; page?: number | null; line?: number | null; quote?: string }
export type RecognitionSourceNote = {
  kind: 'evidence' | 'correction' | 'conflict' | 'uncertain' | 'multipleCustomers' | 'possibleDuplicate'
  field: string; message: string; previousValue?: string | null; suggestedValue?: string | null; references: MaterialReference[]
}
export type MaterialsResult = Worksheet & { sourceNotes?: RecognitionSourceNote[] }
export type MaterialsJob = {
  key: string; items: MaterialItem[]; description: string; importId?: string; source?: MaterialSource
  uploaded?: Map<string, MaterialMetadata>; recognitionKey?: string; retryAttempt?: number
}
type ReportStatus = (key: string, status: MaterialStatus) => void

const extension = (name: string) => name.match(/\.([^.]+)$/)?.[1].toLowerCase() ?? ''
const describedBytes = (value: string) => new Blob([value]).size
const fileBytes = (item: MaterialItem) => item.file?.size ?? item.saved?.byteSize ?? 0
const onStatusDefault = () => {}
const byteLimit = (contentType: string, limits: MaterialLimits) =>
  contentType.startsWith('text/') ? Math.min(limits.maxFileBytes, limits.maxTextBytes) : limits.maxFileBytes

export function newMaterialItems(files: File[], previous: MaterialItem[], limits: MaterialLimits,
  description = '', method: MaterialItem['method'] = 'Upload') {
  const errors: string[] = []
  const items: MaterialItem[] = []
  let size = previous.reduce((total, item) => total + fileBytes(item), describedBytes(description.trim() ? description : ''))
  const reserved = Number(!!description.trim())
  for (const file of files) {
    const contentType = formats[extension(file.name)]
    let error = ''
    if (file.name.toLowerCase() === supplementName || !contentType) error = '请转存 PDF 或 CSV，也可以选择 JPG、PNG、WebP 或 UTF-8 TXT。'
    else if (!file.size) error = '文件为空。请选择其他文件。'
    else if (file.size > byteLimit(contentType, limits)) error = '文件过大。请缩小文件或拆分后重新上传。'
    else if (previous.length + items.length + reserved >= limits.maxFiles) error = `最多 ${limits.maxFiles} 份材料（补充描述计一份）。请移除其他文件后再添加。`
    else if (size + file.size > limits.maxTotalBytes) error = '材料合计超出容量。请缩小文件或移除部分材料。'
    if (error) errors.push(`${file.name} · ${error}`)
    else {
      items.push({ key: crypto.randomUUID(), file, name: file.name, contentType, method })
      size += file.size
    }
  }
  return { items, errors }
}

export function materialValidation(items: MaterialItem[], description: string, limits: MaterialLimits) {
  if (!items.length) return ''
  const oversized = items.find(item => fileBytes(item) > byteLimit(item.contentType, limits))
  if (oversized) return `${oversized.name} · 文件超出容量上限，请移除或拆分后重新添加。`
  const longPdf = items.find(item => item.saved?.pageCount && item.saved.pageCount > limits.maxPdfPages)
  if (longPdf) return `${longPdf.name} · PDF 超出 ${limits.maxPdfPages} 页上限，请移除或拆分后重新添加。`
  const bytes = description.trim() ? describedBytes(description) : 0
  if (bytes > limits.maxDescriptionBytes) return '补充描述超出长度上限，请缩短后重试。'
  if (items.length + Number(bytes > 0) > limits.maxFiles) return `每批最多 ${limits.maxFiles} 份材料（补充描述计一份）。`
  if (items.reduce((total, item) => total + fileBytes(item), bytes) > limits.maxTotalBytes) return '材料合计超出容量。'
  return ''
}

export function restoreMaterialItems(source?: SavedMaterials | null): MaterialItem[] {
  return source?.files.map(file => ({ key: file.id, name: file.name, contentType: file.contentType, method: 'Upload',
    saved: { ...file, importId: source.importId } })) ?? []
}

export async function openMaterialBlob(item: MaterialItem, signal?: AbortSignal) {
  if (item.file) return item.file
  if (!item.saved || item.saved.expired) throw new Error('原件已到期，请移除或重新添加该文件。')
  const response = await fetch(sourceContentUrl(item.saved.importId, item.saved.id), { cache: 'no-store', signal })
  if (response.status === 410 || response.status === 404) throw new Error('原件已到期或不可用，请重新添加该文件。')
  if (!response.ok) throw new Error('原件读取失败，请稍后重试。')
  return response.blob()
}

function uploadError(item: MaterialItem, error: unknown) {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : '上传失败，请重试或移除该文件。'
  const code = (error.details as { error?: { code?: string } } | undefined)?.error?.code
  if (code?.endsWith(':PdfPageLimitExceeded')) return 'PDF 页数超出上限，请拆分文件后重新添加。'
  if (item.contentType === 'application/pdf' && (error.status === 415 || error.status === 422)) {
    return '无法读取这份 PDF，请解密或重新导出 PDF 后再添加。'
  }
  if (error.status === 0) return '上传连接中断，请重试或移除该文件。'
  if (error.status === 413) return '文件大小超出上限，请压缩文件后再添加。'
  return error.message
}

export async function ensureMaterialSources(job: MaterialsJob, signal?: AbortSignal, onStatus: ReportStatus = onStatusDefault) {
  if (job.source) return job.source
  if (!job.items.length) throw new Error('请至少添加一份材料。')
  job.importId ??= (await createAiOrderImport('create-' + job.key, job.key, true, true)).id
  const uploaded = job.uploaded ??= new Map()
  for (const item of job.items) {
    signal?.throwIfAborted()
    if (uploaded.has(item.key)) continue
    onStatus(item.key, { state: 'uploading', percent: 0 })
    try {
      const bytes = await openMaterialBlob(item, signal)
      const file = item.file?.type === item.contentType ? item.file : new File([bytes], item.name, { type: item.contentType })
      const { document } = await uploadAiOrderSource(job.importId, file, item.method, 'material-' + item.key,
        percent => onStatus(item.key, { state: 'uploading', percent }), signal)
      signal?.throwIfAborted()
      const metadata = { id: document.id, name: item.name, contentType: item.contentType, pageCount: document.pageCount,
        expired: false, byteSize: file.size }
      uploaded.set(item.key, metadata)
      onStatus(item.key, { state: 'ready', file: metadata })
    } catch (error) {
      signal?.throwIfAborted()
      const message = uploadError(item, error)
      onStatus(item.key, { state: 'failed', message })
      throw new Error(`${item.name} · ${message}`)
    }
  }
  if (job.description.trim()) {
    await uploadAiOrderSource(job.importId, new File([job.description], supplementName, { type: 'text/plain' }),
      'Upload', 'supplement-' + job.key, onStatusDefault, signal)
  }
  signal?.throwIfAborted()
  return job.source = { importId: job.importId, documentIds: job.items.map(item => uploaded.get(item.key)!.id), description: job.description }
}

export async function recognizeMaterials(job: MaterialsJob, signal: AbortSignal, progress: (text: string) => void, onStatus: ReportStatus) {
  const selected = await receptionModel({ images: job.items.some(item => item.contentType.startsWith('image/')),
    pdfs: job.items.some(item => item.contentType === 'application/pdf') })
  if (!selected) throw new Error('当前没有启用同时支持所选材料类型的 OpenAI 模型。可查看原件并手动填写。')
  signal.throwIfAborted()
  progress('正在上传并校验材料…')
  const source = await ensureMaterialSources(job, signal, onStatus)
  return recognizeReceptionImport<MaterialsResult>(job, source.importId, selected, signal, () => progress('正在联合识别所选材料…'))
}
