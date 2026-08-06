'use client'

import Link from 'next/link'
import { resolveImageUrl } from '@/lib/image-utils'
import type { PrintArea, PrintAreaSizeOption, UploadedAsset } from '@/types'

interface PrintSizeSelectorProps {
  selectedAreas: PrintArea[]
  allowedSizesByArea: Record<string, PrintAreaSizeOption[]>
  allowedSizesLoadingByArea: Record<string, boolean>
  allowedSizesErrorByArea: Record<string, string | undefined>
  printSizeByArea: Record<string, string | undefined>
  errors?: Record<string, string | undefined>
  /** Per-area informational hint when the chosen print size is printed smaller on some garment sizes. */
  printedSmallerNoteByArea?: Record<string, string | undefined>
  onChange: (areaId: string, sizeId: string) => void
  // Upload props (optional — omit to hide upload UI)
  printAreaUploads?: Record<string, UploadedAsset | undefined>
  printAreaNotes?: Record<string, string>
  printAreaUploadErrors?: Record<string, string | undefined>
  uploadingPrintAreaId?: string | null
  dragOverPrintAreaId?: string | null
  onUploadFile?: (areaId: string, file: File) => void
  onRemoveUpload?: (areaId: string) => void
  onNoteChange?: (areaId: string, note: string) => void
  onDragOver?: (areaId: string) => void
  onDragLeave?: () => void
  /** Mobile artwork step reuses the upload mapping without duplicating the size controls. */
  showSizeControls?: boolean
}

export function PrintSizeSelector({
  selectedAreas,
  allowedSizesByArea,
  allowedSizesLoadingByArea,
  allowedSizesErrorByArea,
  printSizeByArea,
  errors,
  printedSmallerNoteByArea,
  onChange,
  printAreaUploads,
  printAreaNotes,
  printAreaUploadErrors,
  uploadingPrintAreaId,
  dragOverPrintAreaId,
  onUploadFile,
  onRemoveUpload,
  onNoteChange,
  onDragOver,
  onDragLeave,
  showSizeControls = true,
}: PrintSizeSelectorProps) {
  if (selectedAreas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line-strong py-4 text-center text-sm text-ink-muted">
        No print areas selected. Blank garment pricing is available.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {selectedAreas.map((area) => {
        const isLoading = allowedSizesLoadingByArea[area.id]
        const loadError = allowedSizesErrorByArea[area.id]
        const allowedSizes = allowedSizesByArea[area.id]
        const selectedSizeId = printSizeByArea[area.id] ?? ''
        const validationError = errors?.[area.id]
        const printedSmallerNote = printedSmallerNoteByArea?.[area.id]

        const asset = printAreaUploads?.[area.id]
        const uploadError = printAreaUploadErrors?.[area.id]
        const isUploading = uploadingPrintAreaId === area.id
        const isDragOver = dragOverPrintAreaId === area.id

        return (
          <div key={area.id} className="rounded-2xl border border-line p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-ink" style={{ fontWeight: 500 }}>
                  {area.name}
                </p>
                <p className="mt-1 eyebrow text-ink-muted">
                  {showSizeControls ? 'Choose one print size' : `Artwork · ${allowedSizes?.find((option) => option.printSize.id === selectedSizeId)?.printSize.name ?? 'size incomplete'}`}
                </p>
              </div>
              <span className="eyebrow text-ink-muted">Placement</span>
            </div>

            {showSizeControls && isLoading && (
              <div className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-control border-t-black" />
                <span>Loading sizes…</span>
              </div>
            )}

            {showSizeControls && !isLoading && loadError && (
              <p className="mt-3 text-sm text-danger">
                {loadError}
              </p>
            )}

            {showSizeControls && !isLoading && !loadError && allowedSizes && allowedSizes.length === 0 && (
              <p className="mt-3 text-sm text-ink-muted">
                No print sizes available for this area.
              </p>
            )}

            {showSizeControls && !isLoading && !loadError && allowedSizes && allowedSizes.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {allowedSizes.map((option) => {
                  const { printSize } = option
                  const isSelected = selectedSizeId === printSize.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onChange(area.id, printSize.id)}
                      className={[
                        'rounded-xl border px-3 py-2 text-left transition-colors',
                        isSelected
                          ? 'border-ink bg-surface-inverse text-white'
                          : 'border-line bg-white text-ink-secondary hover:border-line-control hover:text-ink',
                      ].join(' ')}
                    >
                      <span className="block text-sm" style={{ fontWeight: 500 }}>
                        {printSize.name}
                      </span>
                      <span
                        className={`mt-1 block eyebrow ${
                          isSelected ? 'text-ink-inverse-secondary' : 'text-ink-muted'
                        }`}
                      >
                        Print price
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {showSizeControls && validationError && (
              <p className="mt-2 text-sm text-danger">
                {validationError}
              </p>
            )}

            {showSizeControls && printedSmallerNote && (
              <p
                className="mt-2 rounded-xl border border-warning-border bg-warning-surface px-3 py-2 text-xs text-amber-800"
              >
                {printedSmallerNote}
              </p>
            )}

            {onUploadFile && (
              <div className="mt-3 space-y-2 border-t border-line pt-3">
                <p className="eyebrow text-ink-muted">Upload Design</p>
                <div className="flex items-center gap-2">
                  <label
                    className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 transition-colors ${
                      isDragOver
                        ? 'border-ink bg-surface-sunken'
                        : asset
                        ? 'border-green-300 bg-green-50'
                        : 'border-line-strong hover:border-line-control'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); onDragOver?.(area.id) }}
                    onDragLeave={onDragLeave}
                    onDrop={(e) => {
                      e.preventDefault()
                      onDragLeave?.()
                      const file = e.dataTransfer.files[0]
                      if (file) onUploadFile(area.id, file)
                    }}
                  >
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp,.ai,application/pdf"
                      className="hidden"
                      aria-label={`Upload artwork for ${area.name}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) onUploadFile(area.id, file)
                      }}
                    />
                    {isUploading ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-line-control border-t-black" />
                        <span className="text-xs text-ink-muted">Uploading...</span>
                      </div>
                    ) : asset ? (
                      <div className="flex w-full items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resolveImageUrl(asset.fileUrl) ?? ''}
                          alt=""
                          className="h-7 w-7 shrink-0 rounded border border-line object-contain"
                        />
                        <span className="flex-1 truncate text-xs text-ink">{asset.originalFileName}</span>
                        <span className="shrink-0 eyebrow text-ink-muted">
                          change
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-muted">
                        Drop or click to upload
                      </span>
                    )}
                  </label>
                  {asset && (
                    <button
                      type="button"
                      onClick={() => onRemoveUpload?.(area.id)}
                      aria-label={`Remove artwork for ${area.name}`}
                      className="shrink-0 text-ink-muted transition-colors hover:text-danger"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  value={printAreaNotes?.[area.id] ?? ''}
                  onChange={(e) => onNoteChange?.(area.id, e.target.value)}
                  placeholder="Describe your design requirements..."
                  aria-label={`Design notes for ${area.name}`}
                  className="form-input resize-none text-xs"
                />
                {uploadError && (
                  <p role="alert" className="rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-xs text-danger">
                    {uploadError}
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
      {onUploadFile && (
        // Jira 10303 accuracy fix: this previously advertised SVG and a 10 MB limit. The upload
        // endpoint rejects SVG outright (stored-XSS risk) and allows 20 MB — see
        // backend/src/TeeNova.Application/Files/FileAppService.cs.
        <p className="eyebrow text-ink-muted">
          PNG, JPG, WebP, AI, PDF | max 20 MB |{' '}
          <Link href="/help/artwork-requirements" className="underline underline-offset-2">
            Artwork requirements
          </Link>
        </p>
      )}
      {onUploadFile && (
        <p role="status" aria-live="polite" className="sr-only">
          {uploadingPrintAreaId
            ? `Uploading artwork for ${selectedAreas.find((area) => area.id === uploadingPrintAreaId)?.name ?? 'print area'}.`
            : ''}
        </p>
      )}
    </div>
  )
}
