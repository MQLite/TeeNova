'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/admin/EmptyState'
import { SkeletonBlock } from '@/components/admin/LoadingSkeleton'
import { printConfigApi } from '@/api/print-config'
import type { PrintArea, PrintSize, PrintAreaSizeOption } from '@/types'

interface Props {
  areas: PrintArea[]
  sizes: PrintSize[]
}

export function AllowedSizeManager({ areas, sizes }: Props) {
  const [selectedAreaId,  setSelectedAreaId]  = useState<string | null>(null)
  const [options,         setOptions]         = useState<PrintAreaSizeOption[]>([])
  const [loadingOptions,  setLoadingOptions]  = useState(false)
  const [localChecked,    setLocalChecked]    = useState<Record<string, boolean>>({})
  const [localOrder,      setLocalOrder]      = useState<Record<string, string>>({})
  const [saving,          setSaving]          = useState(false)
  const [saveStatus,      setSaveStatus]      = useState<'idle' | 'saved' | 'error'>('idle')
  const [saveError,       setSaveError]       = useState<string | null>(null)

  // Load options whenever selected area changes
  useEffect(() => {
    if (!selectedAreaId) {
      setOptions([])
      setLocalChecked({})
      setLocalOrder({})
      return
    }

    let cancelled = false
    setLoadingOptions(true)
    setSaveStatus('idle')
    setSaveError(null)

    printConfigApi.getAreaSizes(selectedAreaId, true).then((opts) => {
      if (cancelled) return
      setOptions(opts)

      const checkedMap: Record<string, boolean> = {}
      const orderMap:   Record<string, string>  = {}

      sizes.forEach((s) => {
        const match = opts.find((o) => o.printSizeId === s.id)
        checkedMap[s.id] = match?.isActive ?? false
        orderMap[s.id]   = String(match?.sortOrder ?? 0)
      })

      setLocalChecked(checkedMap)
      setLocalOrder(orderMap)
    }).catch(() => {
      // silently leave blank — user can retry by clicking area again
    }).finally(() => {
      if (!cancelled) setLoadingOptions(false)
    })

    return () => { cancelled = true }
  }, [selectedAreaId, sizes])

  function toggleChecked(sizeId: string) {
    setLocalChecked((prev) => ({ ...prev, [sizeId]: !prev[sizeId] }))
  }

  function setOrder(sizeId: string, value: string) {
    setLocalOrder((prev) => ({ ...prev, [sizeId]: value }))
  }

  async function handleSave() {
    if (!selectedAreaId) return
    setSaving(true)
    setSaveStatus('idle')
    setSaveError(null)

    const payload = sizes.map((s) => ({
      printSizeId: s.id,
      isActive:    localChecked[s.id] ?? false,
      sortOrder:   parseInt(localOrder[s.id] ?? '0', 10) || 0,
    }))

    try {
      const updated = await printConfigApi.setAreaSizes(selectedAreaId, payload)
      setOptions(updated)

      // Re-sync local state from the authoritative response
      const checkedMap: Record<string, boolean> = {}
      const orderMap:   Record<string, string>  = {}
      sizes.forEach((s) => {
        const match = updated.find((o) => o.printSizeId === s.id)
        checkedMap[s.id] = match?.isActive ?? false
        orderMap[s.id]   = String(match?.sortOrder ?? 0)
      })
      setLocalChecked(checkedMap)
      setLocalOrder(orderMap)

      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save.'
      setSaveError(msg)
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  const selectedArea = areas.find((a) => a.id === selectedAreaId)

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      {/* Left panel — area list */}
      <div className="w-full lg:w-64 shrink-0">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
          Print Areas
        </p>
        <div className="overflow-hidden rounded-lg border border-black/[0.08] bg-white">
          {areas.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-black/45">No print areas</p>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {areas.map((area) => {
                const isSelected = area.id === selectedAreaId
                return (
                  <li key={area.id}>
                    <button
                      type="button"
                      disabled={!area.isActive}
                      onClick={() => setSelectedAreaId(area.id)}
                      className={[
                        'flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm transition-colors',
                        isSelected
                          ? 'bg-black text-white'
                          : area.isActive
                            ? 'text-black hover:bg-black/[0.04]'
                            : 'cursor-not-allowed text-black/30',
                      ].join(' ')}
                    >
                      <span>
                        <span className="block" style={{ letterSpacing: '-0.14px' }}>{area.name}</span>
                        <span className={`font-mono text-[10px] ${isSelected ? 'text-white/60' : 'text-black/40'}`}>
                          {area.code}
                        </span>
                      </span>
                      {!area.isActive && (
                        <Badge color="gray">Inactive</Badge>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Right panel — size options */}
      <div className="flex-1 min-w-0">
        {!selectedAreaId ? (
          <EmptyState
            title="Select a print area"
            description="Choose a print area on the left to manage its allowed sizes."
          />
        ) : loadingOptions ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonBlock key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                  Allowed sizes for
                </p>
                <p className="text-sm text-black" style={{ letterSpacing: '-0.14px', fontWeight: 480 }}>
                  {selectedArea?.name}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {saveStatus === 'saved' && (
                  <span className="text-sm text-green-600" style={{ letterSpacing: '-0.14px' }}>
                    Saved
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="text-sm text-red-600" style={{ letterSpacing: '-0.14px' }}>
                    {saveError}
                  </span>
                )}
                <Button
                  variant="black"
                  size="sm"
                  loading={saving}
                  onClick={handleSave}
                >
                  Save
                </Button>
              </div>
            </div>

            {/* Size rows */}
            <div className="overflow-hidden rounded-lg border border-black/[0.08] bg-white divide-y divide-black/[0.06]">
              {sizes.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-black/45">No print sizes defined.</p>
              ) : (
                sizes.map((size) => {
                  const checked  = localChecked[size.id] ?? false
                  const disabled = saving

                  return (
                    <div
                      key={size.id}
                      className={[
                        'flex items-center gap-4 px-4 py-3',
                        !size.isActive ? 'opacity-60' : '',
                      ].join(' ')}
                    >
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        id={`size-${size.id}`}
                        checked={checked}
                        disabled={disabled || !size.isActive}
                        onChange={() => toggleChecked(size.id)}
                        className="h-4 w-4 cursor-pointer accent-black disabled:cursor-not-allowed"
                      />

                      {/* Name + code */}
                      <label
                        htmlFor={`size-${size.id}`}
                        className={[
                          'flex flex-1 cursor-pointer items-center gap-2',
                          (!size.isActive || disabled) ? 'cursor-not-allowed' : '',
                        ].join(' ')}
                      >
                        <span className="text-sm text-black" style={{ letterSpacing: '-0.14px' }}>
                          {size.name}
                        </span>
                        <span className="font-mono text-[10px] text-black/40">{size.code}</span>
                        {!size.isActive && <Badge color="gray">Inactive</Badge>}
                      </label>

                      {/* Sort order input */}
                      <div className="flex items-center gap-1.5">
                        <label
                          htmlFor={`order-${size.id}`}
                          className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40"
                        >
                          Order
                        </label>
                        <input
                          id={`order-${size.id}`}
                          type="number"
                          step="1"
                          value={localOrder[size.id] ?? '0'}
                          disabled={!checked || disabled}
                          onChange={(e) => setOrder(size.id, e.target.value)}
                          className={[
                            'w-16 rounded-lg border border-black/[0.10] bg-white px-2 py-1 text-center text-sm text-black',
                            'focus:border-black/30 focus:outline-none',
                            'disabled:cursor-not-allowed disabled:opacity-40',
                          ].join(' ')}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <p className="text-xs text-black/40" style={{ letterSpacing: '-0.14px' }}>
              Check a size to allow it for this print area. Sort order controls display sequence.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
