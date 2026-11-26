import { useEffect, useState } from 'react'
import { adminApiClient } from '@/lib/admin-client'
import type { Artwork } from './ArtworkPreview'

export const pendingArtworkPath = '/api/gmail-reception/pending'
export type PendingArtwork = Artwork & { sender: string; subject: string; received: string; newCustomer: string | null }

export function pendingArtworkDetails(item: PendingArtwork) {
  const source = item.source === 'upload' ? '本地上传' : item.sender ? 'Gmail · ' + item.sender : 'Gmail 附件'
  const time = new Date(item.received).toLocaleString('zh-NZ', { timeZone: 'Pacific/Auckland' })
  return source + (item.sender ? ' · ' : ' · 退回时间 · ') + time
}

export function useArtworkList<T extends Artwork>(path: string) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setFailed(false)
    adminApiClient.get<T[]>(path, {}, { signal: controller.signal })
      .then(rows => {
        if (controller.signal.aborted) return
        if (Array.isArray(rows)) setItems(rows)
        else setFailed(true)
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [path, revision])
  const refresh = () => setRevision(value => value + 1)
  function remove(id: string) {
    setItems(current => current.filter(item => item.id !== id))
    refresh()
  }
  return { items, loading, failed, refresh, remove }
}
