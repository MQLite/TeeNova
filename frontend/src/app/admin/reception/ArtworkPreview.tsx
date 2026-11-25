'use client'

import { useEffect, useRef, useState } from 'react'
import './artwork.css'

export type Artwork = { id: string; name: string; mime: string }
export const sheetArtworkPath = (id: string) => '/api/proxy/api/gmail-reception/sheets/' + id + '/attachments'

export function ArtworkPreview({ file, base, compact = false }: { file: Artwork; base: string; compact?: boolean }) {
  const url = base + '/' + file.id
  const isPdf = file.mime === 'application/pdf'
  const [open, setOpen] = useState(false)
  const [missingThumb, setMissingThumb] = useState(false)
  const [missingPreview, setMissingPreview] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!open || !dialog.current) return
    const element = dialog.current
    if (element.showModal) element.showModal()
    else element.setAttribute('open', '')
    return () => { if (element.open) element.close?.() }
  }, [open])

  return <>
    <button type="button" className={'art-tile' + (compact ? ' art-compact' : '')} aria-label={'预览 ' + file.name}
      title={file.name} onClick={() => { setMissingPreview(false); setOpen(true) }}>
      {missingThumb ? <span>缩略图不可用</span> : <img loading="lazy" src={isPdf ? url + '/thumbnail' : url}
        alt={file.name + ' 缩略图'} onError={() => setMissingThumb(true)} />}
      {!compact && <span className="art-name">{file.name}</span>}
    </button>
    {open && <dialog ref={dialog} className="art-dialog" aria-label={file.name + ' 预览'}
      onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <div className="art-bar"><strong>{file.name}</strong><button autoFocus type="button" onClick={() => setOpen(false)}>关闭预览</button></div>
      <div className="art-paper">{missingPreview ? <p role="status">无法生成预览，请打开原文件查看。</p> :
        <img src={isPdf ? url + '/preview' : url} alt={file.name + ' 预览图'} onError={() => setMissingPreview(true)} />}</div>
      <div className="art-bar">{isPdf && <span>PDF · 第 1 页</span>}
        <a href={url} target="_blank" rel="noreferrer">打开原文件</a></div>
    </dialog>}
  </>
}
