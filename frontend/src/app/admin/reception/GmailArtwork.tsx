'use client'

import { useEffect, useState } from 'react'
import { adminApiClient } from '@/lib/admin-client'

import { ArtworkPreview, sheetArtworkPath, type Artwork } from './ArtworkPreview'
import { DeleteArtworkButton } from './DeleteSheetButton'

export function GmailArtwork({ sheetId }: { sheetId: string }) {
  const [files, setFiles] = useState<Artwork[]>([])
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const path = '/api/gmail-reception/sheets/' + sheetId + '/attachments'
  useEffect(() => {
    const controller = new AbortController()
    setError(false)
    adminApiClient.get<Artwork[]>(path, {}, { signal: controller.signal })
      .then(items => { if (!controller.signal.aborted) setFiles(items) })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [path, retry])
  if (error) return <p role="alert">Gmail 设计稿读取失败。<button onClick={() => setRetry(n => n + 1)}>重试</button></p>
  if (!files.length) return null
  return <section aria-label="Gmail 设计稿"><h3>Gmail 设计稿</h3><div className="art-strip">{files.map(file =>
    <div key={file.id}><ArtworkPreview file={file} base={sheetArtworkPath(sheetId)} />
      <DeleteArtworkButton name={file.name} path={path + '/' + file.id}
        onDeleted={() => setFiles(current => current.filter(item => item.id !== file.id))} /></div>
  )}</div></section>
}
