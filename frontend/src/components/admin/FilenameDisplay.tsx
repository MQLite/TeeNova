'use client'

interface FilenameDisplayProps {
  fileName: string | null
  title?: string
}

export function FilenameDisplay({ fileName, title }: FilenameDisplayProps) {
  if (!fileName) {
    return <span className="text-black/30">Not available</span>
  }

  return (
    <span className="block truncate text-black" title={title ?? fileName} style={{ letterSpacing: '-0.14px' }}>
      {fileName}
    </span>
  )
}
