'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { redirectToLogin } from '@/lib/admin-client'

interface Props {
  orderId: string
  orderNumber: string
  disabled?: boolean
  /** Surface a friendly error message (e.g. via the page toast). */
  onError?: (message: string) => void
}

/**
 * Downloads the admin order production PDF through the dedicated authenticated route
 * (/api/admin/orders/{id}/production-pdf), which injects the admin Bearer token server-side.
 *
 * Uses fetch + blob so it can show a loading state and friendly errors. The HttpOnly
 * admin_token cookie is sent automatically on this same-origin request. No order state
 * is mutated and nothing is persisted.
 */
export function DownloadProductionPdfButton({ orderId, orderNumber, disabled, onError }: Props) {
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    if (downloading) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/production-pdf`, { cache: 'no-store' })

      if (res.status === 401) {
        redirectToLogin('session-expired')
        return
      }
      if (!res.ok) {
        onError?.(messageForStatus(res.status))
        return
      }

      const blob = await res.blob()
      const filename =
        filenameFromContentDisposition(res.headers.get('content-disposition')) ??
        `Order-${orderNumber}-production-sheet.pdf`

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch {
      onError?.('Could not generate the production PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="white"
      size="sm"
      loading={downloading}
      disabled={disabled || downloading}
      onClick={handleDownload}
    >
      {!downloading && (
        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      )}
      {downloading ? 'Preparing PDF…' : 'Download Production PDF'}
    </Button>
  )
}

function messageForStatus(status: number): string {
  if (status === 403) return 'You do not have permission to download this production PDF.'
  if (status === 404) return 'Order not found or PDF is unavailable.'
  return 'Could not generate the production PDF. Please try again.'
}

/** Parses a download filename from a Content-Disposition header (RFC 5987 filename* or plain filename). */
function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null

  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
    } catch {
      /* fall through to plain filename */
    }
  }

  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain?.[1]?.trim() ?? null
}
