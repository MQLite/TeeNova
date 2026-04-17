'use client'

import { useState } from 'react'
import { catalogApi } from '@/api/catalog'
import { VariantTable } from './VariantTable'
import { VariantFormModal } from './VariantFormModal'
import type { ProductVariant } from '@/types'

interface Props {
  productId: string
  basePrice: number
  initialVariants: ProductVariant[]
}

export function VariantSection({ productId, basePrice, initialVariants }: Props) {
  const [variants,        setVariants]        = useState<ProductVariant[]>(initialVariants)
  const [modalOpen,       setModalOpen]       = useState(false)
  const [editTarget,      setEditTarget]      = useState<ProductVariant | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteLoading,   setDeleteLoading]   = useState(false)

  function openAddModal() {
    setEditTarget(null)
    setModalOpen(true)
  }

  function openEditModal(variant: ProductVariant) {
    setEditTarget(variant)
    setModalOpen(true)
  }

  function handleSaved(saved: ProductVariant) {
    setVariants((prev) => {
      const idx = prev.findIndex((v) => v.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [...prev, saved]
    })
    setModalOpen(false)
  }

  async function handleDeleteConfirm(variantId: string) {
    setDeleteLoading(true)
    try {
      await catalogApi.deleteVariant(productId, variantId)
      setVariants((prev) => prev.filter((v) => v.id !== variantId))
      setConfirmDeleteId(null)
    } catch {
      // Leave the confirm state open so the user can retry or cancel
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">

      {/* Section header */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Variants</p>
          <h2 className="mt-1 text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
            Sizes and colours
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-black/[0.08] bg-black/[0.02] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
            {variants.length} variant{variants.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm text-white transition-opacity hover:opacity-85"
            style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Variant
          </button>
        </div>
      </div>

      {/* Variant table or empty state */}
      {variants.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/[0.10] py-12 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.04]">
            <svg className="h-5 w-5 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
            </svg>
          </div>
          <p className="mt-3 text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
            No variants yet
          </p>
          <p className="mt-1 text-sm text-black/45" style={{ letterSpacing: '-0.14px' }}>
            Add size and colour combinations for this product.
          </p>
          <button
            onClick={openAddModal}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-black/[0.10] bg-white px-4 py-2 text-sm text-black/55 transition-colors hover:border-black/25 hover:text-black"
            style={{ letterSpacing: '-0.14px' }}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Variant
          </button>
        </div>
      ) : (
        <VariantTable
          variants={variants}
          basePrice={basePrice}
          confirmDeleteId={confirmDeleteId}
          deleteLoading={deleteLoading}
          onEdit={openEditModal}
          onDeleteRequest={(id) => setConfirmDeleteId(id)}
          onDeleteConfirm={handleDeleteConfirm}
          onDeleteCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {/* Add/Edit modal */}
      <VariantFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        productId={productId}
        basePrice={basePrice}
        editTarget={editTarget}
        onSaved={handleSaved}
      />

    </section>
  )
}
