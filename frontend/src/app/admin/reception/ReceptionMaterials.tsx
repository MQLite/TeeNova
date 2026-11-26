import { useCallback, useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { materialAccept, openMaterialBlob, type MaterialItem, type MaterialReference, type MaterialStatus, type RecognitionSourceNote } from '@/features/reception/materials'
import { recognitionLabels, type RecognitionField } from '@/features/reception/mergeRecognition'
import { ReceptionPreview } from './ReceptionPdfs'
import type { useReceptionMaterials } from './useReceptionMaterials'

type Materials = ReturnType<typeof useReceptionMaterials>
export type MaterialPreviewTarget = { item?: MaterialItem; page?: number | null; line?: number | null; pageCount?: number | null }

export function useMaterialTabs() {
  const [tab, setTab] = useState<'sources' | 'order'>('order')
  const scroll = useRef({ sources: 0, order: 0 })
  function select(next: typeof tab) {
    if (next === tab) return
    scroll.current[tab] = window.scrollY
    setTab(next)
    requestAnimationFrame(() => window.scrollTo(0, scroll.current[next]))
  }
  const reset = useCallback(() => {
    setTab('order')
    scroll.current = { sources: 0, order: 0 }
  }, [])
  return { tab, select, reset }
}

export function MaterialTabs({ tabs }: { tabs: ReturnType<typeof useMaterialTabs> }) {
  return <div className="rc-material-tabs" role="group" aria-label="切换原件与工单">
    <button type="button" aria-pressed={tabs.tab === 'sources'} onClick={() => tabs.select('sources')}>原件</button>
    <button type="button" aria-pressed={tabs.tab === 'order'} onClick={() => tabs.select('order')}>工单</button>
  </div>
}

export function ReceptionMaterialsEditor({ value, disabled, onAdd, onRemove, onNote, onPreview, onRetry }: {
  value: Materials; disabled: boolean; onAdd: (files: File[], method: MaterialItem['method']) => void
  onRemove: (key: string) => void; onNote: (value: string) => void; onPreview: (target: MaterialPreviewTarget) => void
  onRetry: () => void
}) {
  const picker = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const album = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  function select(event: ChangeEvent<HTMLInputElement>, method: MaterialItem['method']) {
    const input = event.currentTarget
    if (input.files?.length) onAdd(Array.from(input.files), method)
    input.value = ''
  }
  return <section aria-label="从文件生成工作单" className="rc-material-editor">
    <div className="rc-material-drop" data-dragging={dragOver} onDragOver={event => {
      event.preventDefault()
      if (!disabled) setDragOver(true)
    }} onDragLeave={() => setDragOver(false)} onDrop={event => {
      event.preventDefault()
      setDragOver(false)
      if (!disabled) onAdd(Array.from(event.dataTransfer.files), 'Upload')
    }}>
      <input hidden type="file" aria-label="选择接待材料文件" ref={picker} accept={materialAccept} multiple onChange={event => select(event, 'Upload')}/>
      <input hidden type="file" aria-label="拍摄并添加接待材料" ref={camera} accept="image/*" capture="environment" onChange={event => select(event, 'Camera')}/>
      <input hidden type="file" aria-label="从相册添加接待材料" ref={album} accept="image/jpeg,image/png,image/webp" multiple onChange={event => select(event, 'Upload')}/>
      <div className="rc-actions">
        <button type="button" disabled={disabled} onClick={() => picker.current?.click()}>添加文件</button>
        <button type="button" disabled={disabled} onClick={() => album.current?.click()}>从相册添加</button>
        <button type="button" disabled={disabled} onClick={() => camera.current?.click()}>拍照追加</button>
      </div>
      <p>可拖入 PDF、JPG、PNG、WebP、UTF-8 TXT 或 CSV。每批 {value.limits.maxFiles} 份材料，PDF 每份最多 {value.limits.maxPdfPages} 页。</p>
    </div>
    {!!value.selectionErrors.length && <ul className="rc-error" role="alert">{value.selectionErrors.map((error, i) => <li key={i}>{error}</li>)}</ul>}
    <MaterialSources value={value} onPreview={onPreview} onRemove={onRemove} onRetry={onRetry} disabled={disabled}/>
    <label>补充描述（选填）<textarea rows={3} value={value.description} disabled={disabled}
      placeholder="数量见尺码表，印花位置见照片。M 码从 8 件改为 10 件。" onChange={event => onNote(event.target.value)}/></label>
    {value.validation && <p className="rc-error" role="alert">{value.validation}</p>}
  </section>
}

export function MaterialSources({ value, onPreview, onRemove, onRetry, disabled = false }: {
  value: Materials; onPreview: (target: MaterialPreviewTarget) => void; onRemove?: (key: string) => void
  onRetry?: () => void; disabled?: boolean
}) {
  if (!value.items.length) return null
  const editing = !!onRemove
  return <section className="rc-file-sources" aria-label="接待材料">
    <h2>接待材料（{value.items.length}）</h2>
    <ul>{value.items.map(item => <MaterialRow key={item.key} item={item} status={value.statuses[item.key]}
      disabled={disabled} onPreview={onPreview} onRemove={onRemove} onRetry={onRetry}/>)}</ul>
    {!editing && value.description.trim() && <div className="rc-material-note"><h3>补充描述</h3><p>{value.description}</p></div>}
  </section>
}

function MaterialRow({ item, status, disabled, onPreview, onRemove, onRetry }: {
  item: MaterialItem; status?: MaterialStatus; disabled: boolean; onPreview: (target: MaterialPreviewTarget) => void
  onRemove?: (key: string) => void; onRetry?: () => void
}) {
  const metadata = status?.state === 'ready' ? status.file : item.saved
  const format = item.name.split('.').at(-1)?.toUpperCase()
  const statusText = metadata?.expired ? '原件已到期' : status?.state === 'failed' ? '上传失败' :
    status?.state === 'uploading' ? `上传中 ${status.percent}%` : metadata ? (item.saved ? '已保存' : '就绪') : '待上传'
  return <li>
    <div className="rc-file-caption"><strong>{item.name}</strong>
      <small>{format}{metadata?.pageCount ? ` · ${metadata.pageCount} 页` : ''} · <span>{statusText}</span></small>
      {status?.state === 'failed' && <p className="rc-file-error">{status.message}</p>}
    </div>
    <div className="rc-file-actions">
      {!metadata?.expired && <button type="button" aria-label={`预览 ${item.name}`} onClick={() => onPreview({ item, pageCount: metadata?.pageCount })}>预览</button>}
      {onRetry && status?.state === 'failed' && <button type="button" disabled={disabled}
        aria-label={`重试上传 ${item.name}`} onClick={onRetry}>重试上传</button>}
      {onRemove && <button type="button" disabled={disabled} aria-label={`移除 ${item.name}`} onClick={() => onRemove(item.key)}>移除</button>}
    </div>
  </li>
}

const noteLabels: Record<RecognitionSourceNote['kind'], string> = {
  evidence: '来源', correction: '明确更正', conflict: '材料冲突', uncertain: '待核对',
  multipleCustomers: '可能包含不同客户', possibleDuplicate: '可能重复',
}

export function MaterialNotes({ notes, value, onPreview }: { notes: RecognitionSourceNote[]; value: Materials;
  onPreview: (target: MaterialPreviewTarget) => void }) {
  if (!notes.length) return null
  const itemsById = new Map(value.items.flatMap(item => {
    const status = value.statuses[item.key]
    const id = status?.state === 'ready' ? status.file.id : value.documentId(item)
    return id ? [[id, item] as const] : []
  }))
  function referenceLabel(reference: MaterialReference, item?: MaterialItem) {
    return [item?.name ?? '补充描述', reference.page && `第 ${reference.page} 页`, reference.line && `第 ${reference.line} 行`].filter(Boolean).join(' · ')
  }
  return <section className="rc-material-notes" aria-label="识别来源与待核对项">
    <h2>识别来源与待核对项</h2>
    <ul>{notes.map((note, i) => <li key={i}>
      <strong>{noteLabels[note.kind]}{note.field && ` · ${recognitionLabels[note.field as RecognitionField] ?? note.field}`}</strong>
      <p>{note.message}</p>
      {note.previousValue && <p>原值　{note.previousValue}</p>}
      {note.suggestedValue && <p>建议　{note.suggestedValue}</p>}
      {note.references.map((reference, j) => {
        const item = itemsById.get(reference.documentId)
        const status = item ? value.statuses[item.key] : undefined
        const pageCount = status?.state === 'ready' ? status.file.pageCount : item?.saved?.pageCount
        return <div key={j}>
          {(item || value.description.trim()) && <button type="button" onClick={() => onPreview({ item, page: reference.page, line: reference.line, pageCount })}>
            {referenceLabel(reference, item)}</button>}
          {reference.quote && <q>{reference.quote}</q>}
        </div>
      })}
    </li>)}</ul>
  </section>
}

function readText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('文字原件读取失败。'))
    reader.readAsText(blob, 'utf-8')
  })
}

function NumberedMaterialText({ text, line, focusedLine }: { text: string; line?: number | null; focusedLine: RefObject<HTMLElement> }) {
  return <pre className="rc-material-text" tabIndex={0}>{text.split(/\r\n|\n|\r/).map((value, index) =>
    <span key={index} ref={line === index + 1 ? focusedLine : undefined} data-selected={line === index + 1}>
      <span aria-hidden="true">{index + 1}</span>{value}{'\n'}</span>)}</pre>
}

export function MaterialPreview({ target, description, onClose }: {
  target: MaterialPreviewTarget; description: string; onClose: () => void
}) {
  const { item, line, pageCount } = target
  const [page, setPage] = useState(target.page ?? 1)
  const [prepared, setPrepared] = useState<{ value: string; text: boolean }>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const focusedLine = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!item) return
    const controller = new AbortController()
    let url: string | undefined
    setError('')
    setPrepared(undefined)
    openMaterialBlob(item, controller.signal).then(async blob => {
      const text = item.contentType.startsWith('text/')
      const value = text ? await readText(blob) : undefined
      if (controller.signal.aborted) return
      if (value === undefined) url = URL.createObjectURL(blob.slice(0, blob.size, item.contentType))
      setPrepared({ value: value ?? url!, text })
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '原件读取失败。')
    })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [item, attempt])
  useEffect(() => { focusedLine.current?.scrollIntoView?.({ block: 'center' }) }, [prepared, line, description])
  const title = item?.name ?? '补充描述'
  return <ReceptionPreview title={title} onClose={onClose}>
    {!item ? <NumberedMaterialText text={description} line={line} focusedLine={focusedLine}/> : error ? <div className="rc-error" role="alert">{error}
      <button type="button" onClick={() => setAttempt(n => n + 1)}>重试读取</button></div> :
      !prepared ? <p role="status" className="rc-preview-links">正在读取原件…</p> : prepared.text ?
        <NumberedMaterialText text={prepared.value} line={line} focusedLine={focusedLine}/> :
        item.contentType === 'application/pdf' ? <>
          <iframe key={page} title={title} src={`${prepared.value}#page=${page}`}/>
          <div className="rc-preview-links">
            {!!pageCount && pageCount > 1 && <>
              <button type="button" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>上一页</button>
              <span>第 {page} / {pageCount} 页</span>
              <button type="button" disabled={page >= pageCount} onClick={() => setPage(current => current + 1)}>下一页</button>
            </>}
            <a href={`${prepared.value}#page=${page}`} target="_blank" rel="noreferrer">在新标签页打开 PDF</a>
          </div>
        </> : <div className="rc-photo-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={prepared.value} alt={title}/>
        </div>}
  </ReceptionPreview>
}
