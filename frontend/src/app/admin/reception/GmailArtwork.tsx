'use client'

import { useState } from 'react'
import { adminApiClient } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import { ArtworkPreview, sheetArtworkPath, type Artwork } from './ArtworkPreview'
import { ArtworkUpload } from './ArtworkUpload'
import { DeleteArtworkButton } from './DeleteSheetButton'
import { pendingArtworkDetails, pendingArtworkPath, useArtworkList, type PendingArtwork } from './useArtworkList'

export function GmailArtwork({ sheetId }: { sheetId: string }) {
  const path = '/api/gmail-reception/sheets/' + sheetId + '/attachments'
  const files = useArtworkList<Artwork>(path)
  const [choosing, setChoosing] = useState(false)
  const [linking, setLinking] = useState(false)
  return <section aria-label="工单设计稿">
    <ArtworkUpload path={path} onChanged={files.refresh}>
      <button type="button" disabled={linking} aria-expanded={choosing} onClick={() => setChoosing(open => !open)}>
        {choosing ? '收起待关联设计稿' : '从待关联设计稿中选择'}</button>
    </ArtworkUpload>
    {choosing && <PendingPicker sheetId={sheetId} onChanged={files.refresh} linking={linking} setLinking={setLinking}/>}
    {files.failed ? <p role="alert">工单设计稿读取失败。<button type="button" onClick={files.refresh}>重试读取</button></p> :
    <div className="art-strip">{files.items.map(file =>
    <div key={file.id}><ArtworkPreview file={file} base={sheetArtworkPath(sheetId)} />
      <small className="block">{file.source === 'upload' ? '本地上传' : 'Gmail 附件'}</small>
      <DeleteArtworkButton name={file.name} source={file.source} path={path + '/' + file.id}
        onConflict={files.refresh} onDeleted={() => files.remove(file.id)} /></div>
    )}</div>}</section>
}

function PendingPicker({ sheetId, onChanged, linking, setLinking }: {
  sheetId: string; onChanged: () => void; linking: boolean; setLinking: (busy: boolean) => void
}) {
  const pending = useArtworkList<PendingArtwork>(pendingArtworkPath)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const available = pending.items.filter(item => !item.newCustomer)
  async function link(item: PendingArtwork) {
    setLinking(true)
    setError('')
    setStatus('')
    try {
      await adminApiClient.post(pendingArtworkPath + '/' + item.id + '/link/' + sheetId)
      setStatus(item.name + ' 已关联到本工单。')
      pending.refresh()
      onChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '关联未能确认，请重试。')
      if (e instanceof ApiError && (e.status === 409 || e.status === 404)) {
        pending.refresh()
        onChanged()
      }
    } finally { setLinking(false) }
  }
  return <section aria-label="选择待关联设计稿" className="my-3">
    <h3>选择待关联设计稿</h3>
    {pending.failed ? <p role="alert">读取待关联列表失败。<button type="button" onClick={pending.refresh}>重试读取</button></p> :
      pending.loading ? <p role="status">正在读取…</p> :
      !available.length ? <p>暂无可关联的设计稿。</p> :
      <ul>{available.map(item => <li key={item.id}>
        <div><ArtworkPreview file={item} base={'/api/proxy' + pendingArtworkPath} compact/>
          <span className="break-all">{item.name}
            {item.subject && <small className="block">{item.subject}</small>}
            <small className="block">{pendingArtworkDetails(item)}</small></span></div>
        <button type="button" disabled={linking} aria-label={item.name + ' 关联到本工单'}
          onClick={() => void link(item)}>关联到本工单</button>
      </li>)}</ul>}
    {error && <p role="alert" className="rc-error">{error}</p>}
    {status && <p role="status">{status}</p>}
  </section>
}

