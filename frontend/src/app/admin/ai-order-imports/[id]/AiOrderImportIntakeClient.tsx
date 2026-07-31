'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  getAiOrderImport,
  getAiOrderRecognitionOptions,
  getAiOrderOperationsStatus,
  removeAiOrderSource,
  reorderAiOrderSources,
  setAiOrderSourceRotation,
  sourceContentUrl,
  startAiOrderRecognition,
  uploadAiOrderSource,
  type AiOrderImport,
  type AiOrderRecognitionOptions,
  type AiOrderOperationsStatus,
  type AiOrderSourceDocument,
} from '@/api/ai-order-imports'

interface Props {
  importId: string
}

interface UploadItem {
  key: string
  file: File
  captureMethod: 'Camera' | 'Upload'
  progress: number
  status: 'uploading' | 'failed'
  error?: string
}

export function AiOrderImportIntakeClient({ importId }: Props) {
  const cameraInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const replacementInput = useRef<HTMLInputElement>(null)
  const [data, setData] = useState<AiOrderImport>()
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [preview, setPreview] = useState<AiOrderSourceDocument>()
  const [replaceTarget, setReplaceTarget] = useState<string>()
  const [error, setError] = useState<string>()
  const [recognitionOptions, setRecognitionOptions] = useState<AiOrderRecognitionOptions>()
  const [operations, setOperations] = useState<AiOrderOperationsStatus>()
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [startingRecognition, setStartingRecognition] = useState(false)
  const operationKey = useRef<string>()

  async function refresh() {
    const latest = await getAiOrderImport(importId)
    setData(latest)
  }

  useEffect(() => {
    Promise.all([
      refresh(),
      getAiOrderOperationsStatus().then(setOperations),
      getAiOrderRecognitionOptions().then((options) => {
        setRecognitionOptions(options)
        const firstProvider = options.providers[0]
        if (firstProvider) {
          setProvider((current) => current || firstProvider.id)
          setModel((current) => current || firstProvider.models[0]?.id || '')
        }
      }),
    ]).catch((reason: Error) => setError(reason.message))
    // importId identifies this intake for the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId])

  useEffect(() => {
    if (data?.status !== 'Processing') return
    const timer = window.setInterval(() => {
      refresh().catch((reason: Error) => setError(reason.message))
    }, 2000)
    return () => window.clearInterval(timer)
    // Polling is controlled only by the durable server status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.status, importId])

  const selectedProvider = recognitionOptions?.providers.find((option) => option.id === provider)

  function changeProvider(nextProvider: string) {
    setProvider(nextProvider)
    setModel(recognitionOptions?.providers.find((option) => option.id === nextProvider)?.models[0]?.id ?? '')
    operationKey.current = undefined
  }

  function changeModel(nextModel: string) {
    setModel(nextModel)
    operationKey.current = undefined
  }

  async function recognize() {
    if (!data || !provider || !model) return
    setStartingRecognition(true)
    setError(undefined)
    operationKey.current ??= `recognition-${crypto.randomUUID()}`
    try {
      await startAiOrderRecognition(
        importId,
        provider,
        model,
        operationKey.current,
        data.status === 'Failed',
      )
      operationKey.current = undefined
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Recognition could not be started.')
    } finally {
      setStartingRecognition(false)
    }
  }

  async function uploadItem(item: UploadItem, replacingDocumentId?: string) {
    setUploads((current) => [
      ...current.filter((entry) => entry.key !== item.key),
      { ...item, status: 'uploading', progress: 0, error: undefined },
    ])
    try {
      await uploadAiOrderSource(
        importId,
        item.file,
        item.captureMethod,
        item.key,
        (progress) => setUploads((current) =>
          current.map((entry) => entry.key === item.key ? { ...entry, progress } : entry)),
      )
      if (replacingDocumentId) {
        await removeAiOrderSource(importId, replacingDocumentId)
      }
      setUploads((current) => current.filter((entry) => entry.key !== item.key))
      await refresh()
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Upload failed.'
      setUploads((current) =>
        current.map((entry) =>
          entry.key === item.key ? { ...entry, status: 'failed', error: message } : entry),
      )
    }
  }

  async function addFiles(files: FileList | null, captureMethod: 'Camera' | 'Upload') {
    if (!files) return
    for (const file of Array.from(files)) {
      const item: UploadItem = {
        key: `upload-${crypto.randomUUID()}`,
        file,
        captureMethod,
        progress: 0,
        status: 'uploading',
      }
      // Preserve server-side sequence allocation by attaching one selected page at a time.
      await uploadItem(item)
    }
  }

  async function rotate(document: AiOrderSourceDocument) {
    const next = (document.rotationDegrees + 90) % 360
    await setAiOrderSourceRotation(importId, document.id, next)
    await refresh()
  }

  async function move(documentId: string, direction: -1 | 1) {
    if (!data) return
    const ids = data.sourceDocuments.map((document) => document.id)
    const index = ids.indexOf(documentId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    await reorderAiOrderSources(importId, ids)
    await refresh()
  }

  async function remove(documentId: string) {
    if (!window.confirm('Remove this source page? Its audit metadata will be retained.')) return
    await removeAiOrderSource(importId, documentId)
    await refresh()
  }

  function chooseReplacement(documentId: string) {
    setReplaceTarget(documentId)
    replacementInput.current?.click()
  }

  function uploadReplacement(files: FileList | null) {
    const file = files?.[0]
    if (!file || !replaceTarget) return
    const item: UploadItem = {
      key: `replace-${crypto.randomUUID()}`,
      file,
      captureMethod: 'Upload',
      progress: 0,
      status: 'uploading',
    }
    void uploadItem(item, replaceTarget)
    setReplaceTarget(undefined)
  }

  if (!data && !error) {
    return <p className="text-sm text-black/50">Loading AI order import…</p>
  }

  return (
    <div className="admin-page admin-stack">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/admin/ai-order-imports" className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45 hover:text-black">
            ← AI order imports
          </Link>
          <h1 className="mt-2 text-2xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
            AI Order Import
          </h1>
          <p className="mt-1 text-sm text-black/55">
            {data?.status === 'Processing'
              ? 'Recognition continues safely if you leave or refresh this page.'
              : data?.status === 'NeedsReview'
                ? 'The AI extraction is ready for human review.'
                : 'Add every page, then choose an approved recognition provider.'}
          </p>
        </div>
        {data && (
          <span className="w-fit rounded-full border border-black/[0.10] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
            {data.status}
          </span>
        )}
      </div>

      {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => cameraInput.current?.click()}
            disabled={!data?.canModifyDocuments || !operations?.features.intakeEnabled}
            className="rounded-full bg-black px-5 py-2.5 text-sm text-white disabled:opacity-40"
          >
            Take Photo
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={!data?.canModifyDocuments || !operations?.features.intakeEnabled}
            className="rounded-full border border-black/[0.14] bg-white px-5 py-2.5 text-sm text-black disabled:opacity-40"
          >
            Upload Image or PDF
          </button>
        </div>
        <input
          ref={cameraInput}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          aria-label="Take a photo of an order page"
          onChange={(event) => void addFiles(event.target.files, 'Camera')}
        />
        <input
          ref={fileInput}
          className="sr-only"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          aria-label="Select order images or PDFs"
          onChange={(event) => void addFiles(event.target.files, 'Upload')}
        />
        <input
          ref={replacementInput}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          aria-label="Select a replacement source document"
          onChange={(event) => uploadReplacement(event.target.files)}
        />
        <p className="mt-3 text-xs text-black/45">
          JPEG, PNG, WebP, or PDF · up to 15 MB each · 12 sources per import
        </p>
      </section>

      {uploads.length > 0 && (
        <section aria-label="Upload progress" className="space-y-2">
          {uploads.map((item) => (
            <div key={item.key} className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-black">{item.file.name}</p>
                <span className="font-mono text-[10px] text-black/45">
                  {item.status === 'failed' ? 'Failed' : `${item.progress}%`}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.08]">
                <div className="h-full bg-black transition-all" style={{ width: `${item.progress}%` }} />
              </div>
              {item.error && (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p role="alert" className="text-xs text-red-700">{item.error}</p>
                  <button type="button" className="text-xs underline" onClick={() => void uploadItem(item)}>
                    Retry upload
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm text-black" style={{ fontWeight: 520 }}>Source documents</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
            {data?.sourceDocuments.length ?? 0} pages/files
          </span>
        </div>
        {data?.sourceDocuments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/[0.15] px-5 py-12 text-center text-sm text-black/45">
            Take a photo or choose files to begin.
          </div>
        ) : (
          <div className="space-y-3">
            {data?.sourceDocuments.map((document, index) => (
              <article key={document.id} className="card overflow-hidden">
                <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
                  <button
                    type="button"
                    onClick={() => setPreview(document)}
                    className="flex h-28 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/[0.04] md:w-36"
                    aria-label={`Preview source ${document.sequence}`}
                  >
                    {document.contentType.startsWith('image/') ? (
                      // The source is fetched only through the authenticated same-origin bridge.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={sourceContentUrl(importId, document.id)}
                        alt=""
                        className="h-full w-full object-contain"
                        style={{ transform: `rotate(${document.rotationDegrees}deg)` }}
                      />
                    ) : (
                      <span className="font-mono text-xs uppercase text-black/45">PDF preview</span>
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                      Source {document.sequence}
                    </p>
                    <p className="mt-1 truncate text-sm text-black">
                      {document.originalFileName ?? `source-${document.sequence}`}
                    </p>
                    <p className="mt-1 text-xs text-black/45">
                      {(document.byteSize / 1024 / 1024).toFixed(2)} MB
                      {document.imageWidth && ` · ${document.imageWidth}×${document.imageHeight}`}
                      {document.pageCount && ` · ${document.pageCount} pages`}
                    </p>
                    {document.warnings.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {document.warnings.map((warning) => (
                          <p key={warning.code} className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                            {warning.message}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 md:flex md:w-44 md:flex-wrap md:justify-end">
                    <button type="button" onClick={() => setPreview(document)} className="rounded-full border px-3 py-1.5 text-xs">Preview</button>
                    <button type="button" disabled={!data.canModifyDocuments || !operations?.features.intakeEnabled} onClick={() => void rotate(document)} className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40">Rotate</button>
                    <button type="button" disabled={!data.canModifyDocuments || !operations?.features.intakeEnabled || index === 0} onClick={() => void move(document.id, -1)} className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40">Up</button>
                    <button type="button" disabled={!data.canModifyDocuments || !operations?.features.intakeEnabled || index === data.sourceDocuments.length - 1} onClick={() => void move(document.id, 1)} className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40">Down</button>
                    <button type="button" disabled={!data.canModifyDocuments || !operations?.features.intakeEnabled} onClick={() => chooseReplacement(document.id)} className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40">Replace</button>
                    <button type="button" disabled={!data.canModifyDocuments || !operations?.features.intakeEnabled} onClick={() => void remove(document.id)} className="rounded-full border border-red-200 px-3 py-1.5 text-xs text-red-700 disabled:opacity-40">Remove</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-col-reverse gap-3 border-t border-black/[0.08] pt-5 sm:flex-row sm:justify-between">
        <Link href="/admin/ai-order-imports" className="rounded-full border border-black/[0.14] px-5 py-2.5 text-center text-sm">
          Save and Exit
        </Link>
        <div className="w-full space-y-3 sm:w-auto sm:min-w-96">
          {(data?.status === 'Uploaded' || data?.status === 'Failed') && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-black/55">
                Provider
                <select
                  aria-label="Recognition provider"
                  value={provider}
                  onChange={(event) => changeProvider(event.target.value)}
                  className="mt-1 block w-full rounded-xl border border-black/[0.14] bg-white px-3 py-2 text-sm text-black"
                >
                  {recognitionOptions?.providers.map((option) => (
                    <option key={option.id} value={option.id}>{option.displayName}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-black/55">
                Model
                <select
                  aria-label="Recognition model"
                  value={model}
                  onChange={(event) => changeModel(event.target.value)}
                  className="mt-1 block w-full rounded-xl border border-black/[0.14] bg-white px-3 py-2 text-sm text-black"
                >
                  {selectedProvider?.models.map((option) => (
                    <option key={option.id} value={option.id}>{option.displayName}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {data?.recognition && (
            <div aria-live="polite" className="rounded-xl bg-black/[0.04] px-3 py-2 text-xs text-black/60">
              Attempt {data.recognition.attemptNumber}: {data.recognition.provider} / {data.recognition.model}
              {' · '}{data.recognition.outcome}
              {data.recognition.safeErrorCode && ` · ${data.recognition.safeErrorCode}`}
            </div>
          )}
          <button
            type="button"
            disabled={
              startingRecognition ||
              data?.status === 'Processing' ||
              data?.status === 'NeedsReview' ||
              (!data?.canContinueToRecognition && data?.status !== 'Failed') ||
              !recognitionOptions?.recognitionEnabled ||
              !operations?.features.recognitionEnabled ||
              !provider ||
              !model
            }
            onClick={() => void recognize()}
            className="w-full rounded-full bg-black px-5 py-2.5 text-sm text-white disabled:opacity-40"
          >
            {data?.status === 'Processing'
              ? 'Recognition processing…'
              : data?.status === 'Failed'
                ? 'Retry recognition'
                : data?.status === 'NeedsReview'
                  ? 'Recognition ready for review'
                  : startingRecognition
                    ? 'Starting recognition…'
                    : 'Start AI recognition'}
          </button>
          {(data?.status === 'NeedsReview' || data?.status === 'Draft') &&
            operations?.features.reviewEnabled && (
            <Link
              href={`/admin/ai-order-imports/${importId}/review`}
              className="block w-full rounded-full bg-black px-5 py-2.5 text-center text-sm text-white"
            >
              {data.status === 'Draft' ? 'Continue Draft Review' : 'Open Review Workspace'}
            </Link>
          )}
          {recognitionOptions && !recognitionOptions.recognitionEnabled && (
            <p className="text-xs text-black/45">No AI provider is currently enabled by an operator.</p>
          )}
        </div>
      </div>

      {preview && (
        <div role="dialog" aria-modal="true" aria-label="Source preview" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6">
          <div className="flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm text-black">Source {preview.sequence}</p>
              <button type="button" onClick={() => setPreview(undefined)} className="rounded-full border px-3 py-1 text-xs">Close</button>
            </div>
            <div className="min-h-0 flex-1 bg-black/[0.03]">
              {preview.contentType === 'application/pdf' ? (
                <iframe
                  src={sourceContentUrl(importId, preview.id)}
                  title={`Source ${preview.sequence} PDF`}
                  className="h-full w-full"
                />
              ) : (
                <div className="flex h-full items-center justify-center overflow-auto p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sourceContentUrl(importId, preview.id)}
                    alt={`Source ${preview.sequence}`}
                    className="max-h-full max-w-full object-contain"
                    style={{ transform: `rotate(${preview.rotationDegrees}deg)` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
