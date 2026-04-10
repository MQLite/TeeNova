'use client'

interface Props {
  url: string
}

export function DownloadDesignButton({ url }: Props) {
  const proxyHref = `/api/download?url=${encodeURIComponent(url)}`
  const fileName = decodeURIComponent(url.split('/').pop() ?? 'design')

  return (
    <a
      href={proxyHref}
      download={fileName}
      className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-gray-50 border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Download Design
    </a>
  )
}
