'use client'

import { resolveImageUrl } from '@/lib/image-utils'
import type { PrintArea, PrintAreaSizeOption, UploadedAsset } from '@/types'

interface PrintSizeSelectorProps {
  selectedAreas: PrintArea[]
  allowedSizesByArea: Record<string, PrintAreaSizeOption[]>
  allowedSizesLoadingByArea: Record<string, boolean>
  allowedSizesErrorByArea: Record<string, string | undefined>
  printSizeByArea: Record<string, string | undefined>
  errors?: Record<string, string | undefined>
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
}

export function PrintSizeSelector({
  selectedAreas,
  allowedSizesByArea,
  allowedSizesLoadingByArea,
  allowedSizesErrorByArea,
  printSizeByArea,
  errors,
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
}: PrintSizeSelectorProps) {
  if (selectedAreas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-black/[0.12] py-4 text-center text-sm text-black/55">
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

        const asset = printAreaUploads?.[area.id]
        const uploadError = printAreaUploadErrors?.[area.id]
        const isUploading = uploadingPrintAreaId === area.id
        const isDragOver = dragOverPrintAreaId === area.id

        return (
          <div key={area.id} className="rounded-2xl border border-black/[0.08] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                  {area.name}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                  Choose one print size
                </p>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Placement</span>
            </div>

            {isLoading && (
              <div className="mt-3 flex items-center gap-2 text-sm text-black/55">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/10 border-t-black" />
                <span style={{ letterSpacing: '-0.14px' }}>Loading sizes…</span>
              </div>
            )}

            {!isLoading && loadError && (
              <p className="mt-3 text-sm text-red-600" style={{ letterSpacing: '-0.14px' }}>
                {loadError}
              </p>
            )}

            {!isLoading && !loadError && allowedSizes && allowedSizes.length === 0 && (
              <p className="mt-3 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
                No print sizes available for this area.
              </p>
            )}

            {!isLoading && !loadError && allowedSizes && allowedSizes.length > 0 && (
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
                          ? 'border-black bg-black text-white'
                          : 'border-black/[0.10] bg-white text-black/60 hover:border-black/25 hover:text-black',
                      ].join(' ')}
                    >
                      <span className="block text-sm" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                        {printSize.name}
                      </span>
                      <span
                        className={`mt-1 block font-mono text-[10px] uppercase tracking-[0.54px] ${
                          isSelected ? 'text-white/70' : 'text-black/45'
                        }`}
                      >
                        Print price
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {validationError && (
              <p className="mt-2 text-sm text-red-600" style={{ letterSpacing: '-0.14px' }}>
                {validationError}
              </p>
            )}

            {onUploadFile && (
              <div className="mt-3 space-y-2 border-t border-black/[0.08] pt-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Upload Design</p>
                <div className="flex items-center gap-2">
                  <label
                    className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 transition-colors ${
                      isDragOver
                        ? 'border-black bg-black/[0.03]'
                        : asset
                        ? 'border-green-300 bg-green-50'
                        : 'border-black/[0.12] hover:border-black/30'
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
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) onUploadFile(area.id, file)
                      }}
                    />
                    {isUploading ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-black" />
                        <span className="text-xs text-black/55">Uploading...</span>
                      </div>
                    ) : asset ? (
                      <div className="flex w-full items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resolveImageUrl(asset.fileUrl) ?? ''}
                          alt=""
                          className="h-7 w-7 shrink-0 rounded border border-black/[0.08] object-contain"
                        />
                        <span className="flex-1 truncate text-xs text-black">{asset.originalFileName}</span>
                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.54px] text-black/50">
                          change
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>
                        Drop or click to upload
                      </span>
                    )}
                  </label>
                  {asset && (
                    <button
                      type="button"
                      onClick={() => onRemoveUpload?.(area.id)}
                      className="shrink-0 text-black/25 transition-colors hover:text-red-500"
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
                  className="form-input resize-none text-xs"
                />
                {uploadError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {uploadError}
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
      {onUploadFile && (
        <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
          PNG, JPG, SVG, WebP, AI, PDF | max 10 MB
        </p>
      )}
    </div>
  )
}
