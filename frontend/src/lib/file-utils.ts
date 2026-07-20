export function fileTypeLabel(contentType: string): string {
  if (contentType.includes('svg')) return 'SVG'
  if (contentType.includes('png')) return 'PNG'
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'JPG'
  if (contentType.includes('webp')) return 'WebP'
  if (contentType.includes('pdf')) return 'PDF'
  if (contentType.includes('illustrator') || contentType.includes('postscript')) return 'AI'
  return 'FILE'
}

export function fileTypeCategory(contentType: string): string {
  if (contentType.includes('pdf')) return 'PDFs'
  if (contentType.includes('illustrator') || contentType.includes('postscript')) return 'AI / Vector'
  if (contentType.includes('svg')) return 'AI / Vector'
  return 'Images'
}

export function fileSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0 || !Number.isInteger(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`

  const units = ['KB', 'MB', 'GB'] as const
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const formatted = value >= 100 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, '')
  return `${formatted} ${units[unitIndex]}`
}

export function isPreviewable(contentType: string): boolean {
  return contentType.startsWith('image/')
}

export function fileTypeBadgeClasses(contentType: string): string {
  if (contentType.includes('svg') || contentType.includes('illustrator') || contentType.includes('postscript'))
    return 'bg-purple-100 text-purple-700'
  if (contentType.includes('pdf')) return 'bg-red-100 text-red-700'
  return 'bg-sky-100 text-sky-700'
}
