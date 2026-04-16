'use client'

import { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { PrintPosition } from '@/types'

function formatPosition(pos: string) {
  return pos.replace(/([A-Z])/g, ' $1').trim()
}

interface Props {
  url: string
  fileName: string | null
  position: PrintPosition
  onClose: () => void
}

export function ImageZoomModal({ url, fileName, position, onClose }: Props) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() },
    [onClose],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [handleKey])

  const proxyHref = `/api/download?url=${encodeURIComponent(url)}`
  const downloadName = fileName ?? decodeURIComponent(url.split('/').pop() ?? 'design')

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex flex-shrink-0 items-center justify-between border-b border-white/10 px-5 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-white/70">
            {formatPosition(position)}
          </span>
          {fileName && (
            <span className="hidden truncate text-xs text-white/50 sm:block" style={{ letterSpacing: '-0.14px' }}>
              {fileName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={proxyHref}
            download={downloadName}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 rounded-[50px] border border-white/20 bg-white/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.54px] text-white/70 transition-colors hover:bg-white/20 hover:text-white"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </a>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
            aria-label="Close preview"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Image */}
      <div
        className="flex flex-1 items-center justify-center overflow-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`Design for ${formatPosition(position)}`}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          style={{ imageRendering: 'auto' }}
        />
      </div>

      {/* Hint */}
      <div className="flex-shrink-0 pb-4 text-center font-mono text-[10px] uppercase tracking-[0.54px] text-white/25">
        Press Esc or click outside to close
      </div>
    </div>,
    document.body,
  )
}
