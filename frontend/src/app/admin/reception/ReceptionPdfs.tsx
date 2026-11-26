import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatNzDateTime } from '@/lib/datetime'
import { fetchSheetPdfs, sheetPdfUrl, type SavedSheet, type SheetPdf } from './sheets'

export function ReceptionPdfs({ sheet, dirty, generated, preview, onPreview }: {
  sheet: SavedSheet
  dirty: boolean
  generated: SheetPdf[]
  preview?: SheetPdf
  onPreview: (pdf?: SheetPdf) => void
}) {
  const [files, setFiles] = useState<SheetPdf[]>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setFailed(false)
    fetchSheetPdfs(sheet.id, controller.signal).then(items => {
      if (!Array.isArray(items)) throw new Error('Invalid PDF history response')
      if (!controller.signal.aborted) setFiles(items)
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [sheet.id, attempt])

  const byId = new Map((files ?? []).map(file => [file.id, file]))
  for (const file of generated) {
    // Once a saved version is superseded it cannot become current again.
    if (!byId.has(file.id) || !file.isCurrent) byId.set(file.id, file)
  }
  const history = Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const versionLabel = (file: SheetPdf) => file.isCurrent && !dirty && sheet.version === file.version ? '当前版本' : '旧版'
  return <>
    <details className="rc-disclosure rc-pdf-history">
      <summary>工作单 PDF{history.length ? `（${history.length}）` : ''}</summary>
      <section aria-label="工作单 PDF">
        {failed ? <p>PDF 记录读取失败。<button type="button" onClick={() => setAttempt(n => n + 1)}>重试读取</button></p> :
          !history.length && <p>{files ? '暂无已生成的工作单 PDF。' : '正在读取 PDF 记录…'}</p>}
        {!!history.length && <ul>{history.map(file => <li key={file.id}>
          <span>{versionLabel(file)} · {file.pages} 页 · {formatNzDateTime(file.createdAt)}</span>
          <div><button type="button" onClick={() => onPreview(file)}>预览 PDF</button>
            <a href={sheetPdfUrl(sheet.id, file.id, true)} download>下载 PDF</a></div>
        </li>)}</ul>}
      </section>
    </details>
    {preview && <ReceptionPreview title="工作单 PDF 预览" onClose={() => onPreview()}>
      <div className="rc-preview-links">
        <span>{versionLabel(byId.get(preview.id) ?? preview)} · {preview.pages} 页</span>
        <a href={sheetPdfUrl(sheet.id, preview.id)} target="_blank" rel="noreferrer">打开 PDF 打印</a>
        <a href={sheetPdfUrl(sheet.id, preview.id, true)} download>下载 PDF</a>
      </div>
      <PdfPages key={preview.id} url={sheetPdfUrl(sheet.id, preview.id)} pages={preview.pages} />
    </ReceptionPreview>}
  </>
}

function PdfPages({ url, pages }: { url: string; pages: number }) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  function showPage(next: number) {
    setStatus('loading')
    setPage(next)
  }
  return <>
    {pages > 1 && <nav aria-label="PDF 翻页" className="rc-preview-links">
      <button type="button" disabled={page === 1} onClick={() => showPage(page - 1)}>上一页</button>
      <span aria-live="polite">第 {page} / {pages} 页</span>
      <button type="button" disabled={page === pages} onClick={() => showPage(page + 1)}>下一页</button>
    </nav>}
    <div key={page} className="rc-pdf-page">
      {status === 'loading' && <p role="status">正在读取第 {page} 页…</p>}
      {status === 'failed' ? <p role="alert">本页预览读取失败。<button type="button" onClick={() => setStatus('loading')}>重试预览</button></p> :
        // The browser must send the admin cookie directly to the private proxy.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${url}/pages/${page}`} alt={`工作单 PDF 第 ${page} 页`}
          onLoad={() => setStatus('ready')} onError={() => setStatus('failed')} />}
    </div>
  </>
}

export function ReceptionPreview({ title, children, onClose }: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (element.showModal) element.showModal()
    else element.setAttribute('open', '')
    return () => {
      if (element.open) {
        if (element.close) element.close()
        else element.removeAttribute('open')
      }
    }
  }, [])
  return <dialog ref={dialog} className="rc-preview-dialog" aria-label={title} onCancel={event => {
    event.preventDefault()
    onClose()
  }}>
    <div className="rc-preview-bar"><strong>{title}</strong><button type="button" autoFocus onClick={onClose}>关闭预览</button></div>
    {children}
  </dialog>
}
