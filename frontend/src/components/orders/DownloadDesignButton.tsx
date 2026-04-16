'use client'

interface Props {
  url: string
  fileName?: string | null
  compact?: boolean
}

export function DownloadDesignButton({ url, fileName, compact = false }: Props) {
  const proxyHref = `/api/download?url=${encodeURIComponent(url)}`
  const downloadName = fileName ?? decodeURIComponent(url.split('/').pop() ?? 'design')

  return (
    <a
      href={proxyHref}
      download={downloadName}
      className={
        compact
          ? 'inline-flex w-full items-center justify-center gap-1 rounded-[50px] border border-black/[0.10] bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/50 transition-colors hover:border-black/25 hover:text-black'
          : 'inline-flex items-center gap-1.5 rounded-[50px] border border-black/[0.10] bg-white px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50 transition-colors hover:border-black/25 hover:text-black'
      }
    >
      <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Download
    </a>
  )
}
