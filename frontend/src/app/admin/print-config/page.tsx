'use client'

import { useEffect, useState } from 'react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { SkeletonTable } from '@/components/admin/LoadingSkeleton'
import { PrintAreaTable } from '@/components/admin/print-config/PrintAreaTable'
import { PrintAreaFormModal } from '@/components/admin/print-config/PrintAreaFormModal'
import { PrintSizeTable } from '@/components/admin/print-config/PrintSizeTable'
import { PrintSizeFormModal } from '@/components/admin/print-config/PrintSizeFormModal'
import { AllowedSizeManager } from '@/components/admin/print-config/AllowedSizeManager'
import { printConfigApi } from '@/api/print-config'
import type { PrintArea, PrintSize } from '@/types'

type Tab = 'areas' | 'sizes' | 'allowed'
type StatusFilter = 'all' | 'active' | 'inactive'

const TABS: { label: string; value: Tab }[] = [
  { label: 'Print Areas', value: 'areas' },
  { label: 'Print Sizes', value: 'sizes' },
  { label: 'Allowed Sizes', value: 'allowed' },
]

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All',      value: 'all'      },
  { label: 'Active',   value: 'active'   },
  { label: 'Inactive', value: 'inactive' },
]

export default function PrintConfigPage() {
  const [activeTab,         setActiveTab]         = useState<Tab>('areas')
  const [areas,             setAreas]             = useState<PrintArea[]>([])
  const [sizes,             setSizes]             = useState<PrintSize[]>([])
  const [loadingAreas,      setLoadingAreas]      = useState(true)
  const [loadingSizes,      setLoadingSizes]      = useState(true)
  const [areaStatusFilter,  setAreaStatusFilter]  = useState<StatusFilter>('all')
  const [sizeStatusFilter,  setSizeStatusFilter]  = useState<StatusFilter>('all')
  const [areaModal,         setAreaModal]         = useState(false)
  const [sizeModal,         setSizeModal]         = useState(false)
  const [editArea,          setEditArea]          = useState<PrintArea | null>(null)
  const [editSize,          setEditSize]          = useState<PrintSize | null>(null)
  const [toast,             setToast]             = useState<string | null>(null)
  const [toastTone,         setToastTone]         = useState<'success' | 'error'>('success')

  function showToast(msg: string, tone: 'success' | 'error' = 'success') {
    setToast(msg)
    setToastTone(tone)
    setTimeout(() => setToast(null), 3000)
  }

  async function loadAreas() {
    setLoadingAreas(true)
    try {
      const data = await printConfigApi.getAdminAreas()
      setAreas(data)
    } finally {
      setLoadingAreas(false)
    }
  }

  async function loadSizes() {
    setLoadingSizes(true)
    try {
      const data = await printConfigApi.getAdminSizes()
      setSizes(data)
    } finally {
      setLoadingSizes(false)
    }
  }

  useEffect(() => { loadAreas() }, [])
  useEffect(() => { loadSizes() }, [])

  // ── PrintArea actions ────────────────────────────────────────────────────────

  function openCreateArea() {
    setEditArea(null)
    setAreaModal(true)
  }

  function openEditArea(area: PrintArea) {
    setEditArea(area)
    setAreaModal(true)
  }

  async function handleDeactivateArea(area: PrintArea) {
    try {
      await printConfigApi.deleteArea(area.id)
      showToast(`"${area.name}" deactivated.`)
      await loadAreas()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to deactivate.'
      showToast(msg, 'error')
    }
  }

  async function handleReactivateArea(area: PrintArea) {
    try {
      await printConfigApi.updateArea(area.id, {
        name:      area.name,
        code:      area.code,
        basePrice: area.basePrice,
        sortOrder: area.sortOrder,
        isActive:  true,
      })
      showToast(`"${area.name}" reactivated.`)
      await loadAreas()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reactivate.'
      showToast(msg, 'error')
    }
  }

  // ── PrintSize actions ────────────────────────────────────────────────────────

  function openCreateSize() {
    setEditSize(null)
    setSizeModal(true)
  }

  function openEditSize(size: PrintSize) {
    setEditSize(size)
    setSizeModal(true)
  }

  async function handleDeactivateSize(size: PrintSize) {
    try {
      await printConfigApi.deleteSize(size.id)
      showToast(`"${size.name}" deactivated.`)
      await loadSizes()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to deactivate.'
      showToast(msg, 'error')
    }
  }

  async function handleReactivateSize(size: PrintSize) {
    try {
      await printConfigApi.updateSize(size.id, {
        name:      size.name,
        code:      size.code,
        basePrice: size.basePrice,
        sortOrder: size.sortOrder,
        isActive:  true,
      })
      showToast(`"${size.name}" reactivated.`)
      await loadSizes()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reactivate.'
      showToast(msg, 'error')
    }
  }

  // ── Filtered lists ───────────────────────────────────────────────────────────

  const filteredAreas = areas.filter((a) =>
    areaStatusFilter === 'all'      ? true :
    areaStatusFilter === 'active'   ? a.isActive :
    !a.isActive
  )

  const filteredSizes = sizes.filter((s) =>
    sizeStatusFilter === 'all'      ? true :
    sizeStatusFilter === 'active'   ? s.isActive :
    !s.isActive
  )

  // ── Header action button ─────────────────────────────────────────────────────

  const headerAction =
    activeTab === 'areas' ? (
      <button
        onClick={openCreateArea}
        className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm text-white transition-opacity hover:opacity-85"
        style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add Print Area
      </button>
    ) : activeTab === 'sizes' ? (
      <button
        onClick={openCreateSize}
        className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm text-white transition-opacity hover:opacity-85"
        style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add Print Size
      </button>
    ) : null

  return (
    <div className="admin-page admin-stack">
      <AdminPageHeader
        title="Print Config"
        subtitle="Manage print areas, sizes, and allowed combinations."
        action={headerAction}
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={[
              'flex-shrink-0 rounded-[50px] px-4 py-2 text-sm transition-all',
              activeTab === tab.value
                ? 'bg-black text-white shadow-sm'
                : 'border border-black/[0.08] bg-white text-black/50 hover:border-black/20 hover:text-black',
            ].join(' ')}
            style={{ letterSpacing: '-0.14px' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Print Areas tab ──────────────────────────────────────────────────── */}
      {activeTab === 'areas' && (
        <div className="space-y-3">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setAreaStatusFilter(tab.value)}
                className={[
                  'flex-shrink-0 rounded-[50px] px-3 py-1.5 text-xs transition-all',
                  areaStatusFilter === tab.value
                    ? 'bg-black text-white shadow-sm'
                    : 'border border-black/[0.08] bg-white text-black/50 hover:border-black/20 hover:text-black',
                ].join(' ')}
                style={{ letterSpacing: '-0.14px' }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loadingAreas ? (
            <SkeletonTable rows={4} cols={7} />
          ) : (
            <PrintAreaTable
              areas={filteredAreas}
              onEdit={openEditArea}
              onDeactivate={handleDeactivateArea}
              onReactivate={handleReactivateArea}
            />
          )}
        </div>
      )}

      {/* ── Print Sizes tab ──────────────────────────────────────────────────── */}
      {activeTab === 'sizes' && (
        <div className="space-y-3">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setSizeStatusFilter(tab.value)}
                className={[
                  'flex-shrink-0 rounded-[50px] px-3 py-1.5 text-xs transition-all',
                  sizeStatusFilter === tab.value
                    ? 'bg-black text-white shadow-sm'
                    : 'border border-black/[0.08] bg-white text-black/50 hover:border-black/20 hover:text-black',
                ].join(' ')}
                style={{ letterSpacing: '-0.14px' }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loadingSizes ? (
            <SkeletonTable rows={4} cols={6} />
          ) : (
            <PrintSizeTable
              sizes={filteredSizes}
              onEdit={openEditSize}
              onDeactivate={handleDeactivateSize}
              onReactivate={handleReactivateSize}
            />
          )}
        </div>
      )}

      {/* ── Allowed Sizes tab ────────────────────────────────────────────────── */}
      {activeTab === 'allowed' && (
        loadingAreas || loadingSizes ? (
          <SkeletonTable rows={4} cols={3} />
        ) : (
          <AllowedSizeManager areas={areas} sizes={sizes} />
        )
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      <PrintAreaFormModal
        open={areaModal}
        onClose={() => setAreaModal(false)}
        editTarget={editArea}
        onSaved={loadAreas}
      />

      <PrintSizeFormModal
        open={sizeModal}
        onClose={() => setSizeModal(false)}
        editTarget={editSize}
        onSaved={loadSizes}
      />

      {/* ── Toast ────────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={[
            'fixed bottom-6 right-6 z-50 rounded-[50px] px-5 py-2.5 text-sm text-white shadow-lg',
            toastTone === 'error' ? 'bg-red-600' : 'bg-black',
          ].join(' ')}
          style={{ letterSpacing: '-0.14px' }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
