'use client'

import { useEffect, useRef, useState } from 'react'

interface DownloadLogButtonProps {
  fileId: string
  fileName: string
  disabled?: boolean
}

export function DownloadLogButton({ fileId, fileName, disabled }: DownloadLogButtonProps) {
  const [starting, setStarting] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
  }, [])

  function startDownload() {
    if (disabled || starting) return
    setStarting(true)

    const anchor = document.createElement('a')
    anchor.href = buildAdminLogDownloadPath(fileId)
    anchor.hidden = true
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    resetTimer.current = setTimeout(() => setStarting(false), 1200)
  }

  return (
    <button
      type="button"
      onClick={startDownload}
      disabled={disabled || starting}
      aria-label={`Download ${fileName}`}
      className="inline-flex min-w-20 items-center justify-center rounded-full border border-black/[0.12] bg-white px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.4px] text-black/60 transition-colors hover:border-black/30 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
    >
      {starting ? 'Starting…' : 'Download'}
    </button>
  )
}

export function buildAdminLogDownloadPath(fileId: string): string {
  return `/api/download/admin-logs/${encodeURIComponent(fileId)}`
}
