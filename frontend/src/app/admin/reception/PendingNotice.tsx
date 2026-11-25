'use client'

import { useEffect, useState } from 'react'
import { adminApiClient } from '@/lib/admin-client'
import './desk-notice.css'

type Notice = { count: number; latest: number }
const dismissedKey = 'teenova.reception.pendingNotice.dismissedThrough'

export function PendingNotice() {
  const [notice, setNotice] = useState<Notice>()
  const [dismissed, setDismissed] = useState(0)
  useEffect(() => {
    try { setDismissed(Number(sessionStorage.getItem(dismissedKey)) || 0) } catch { /* Storage is optional. */ }
    const request = new AbortController()
    let loading = false
    async function refresh() {
      if (loading || document.visibilityState === 'hidden') return
      loading = true
      try {
        const updated = await adminApiClient.get<Notice>('/api/gmail-reception/pending/notice', {}, { signal: request.signal })
        if (!request.signal.aborted) setNotice(updated)
      } catch { /* Retry on focus or the next refresh. */ }
      finally { loading = false }
    }
    void refresh()
    const timer = window.setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      request.abort()
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  if (!notice?.count || notice.latest <= dismissed) return null
  function dismiss() {
    const latest = notice!.latest
    setDismissed(latest)
    try { sessionStorage.setItem(dismissedKey, String(latest)) } catch { /* Keep the in-page dismissal. */ }
  }
  return <aside className="rc-pending-notice" aria-label="待关联设计稿提醒">
    <strong>有 {notice.count} 份待关联设计稿</strong>
    <a href="/admin/reception/pending">查看设计稿</a>
    <button type="button" onClick={dismiss} aria-label="关闭待关联设计稿提醒">关闭提示</button>
  </aside>
}
