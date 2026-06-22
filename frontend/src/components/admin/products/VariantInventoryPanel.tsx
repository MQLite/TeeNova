'use client'

import { useState } from 'react'
import type { ProductVariant } from '@/types'
import { VariantInventoryBadge } from './VariantInventoryBadge'
import { VariantInventoryModal } from './VariantInventoryModal'

interface Props {
  productId: string
  variants: ProductVariant[]
  onInventoryUpdated: (variant: ProductVariant) => void
}

function formatUpdated(at: string | null, by: string | null): string | null {
  if (!at) return null
  const date = new Date(at).toLocaleDateString('en-NZ', { dateStyle: 'medium' })
  return by ? `${date} · ${by}` : date
}

/**
 * Read + edit informational inventory per variant. Independent of the variant matrix —
 * writes go through the dedicated inventory endpoint only, so saving here never touches
 * price/color/size/SKU/availability, and matrix saves never touch inventory.
 */
export function VariantInventoryPanel({ productId, variants, onInventoryUpdated }: Props) {
  const [editTarget, setEditTarget] = useState<ProductVariant | null>(null)
  const [savedLabel, setSavedLabel] = useState<string | null>(null)

  function handleSaved(updated: ProductVariant) {
    onInventoryUpdated(updated)
    setEditTarget(null)
    setSavedLabel(`${updated.color} / ${updated.size}`)
  }

  if (variants.length === 0) {
    return (
      <section className="mt-6 rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
        <Header />
        <p className="mt-4 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-4 text-sm text-black/55">
          Save variants above first — inventory can then be recorded per variant.
        </p>
      </section>
    )
  }

  return (
    <section className="mt-6 rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
      <Header />

      <p className="mt-3 text-xs text-black/45" style={{ letterSpacing: '-0.14px' }}>
        Inventory is for admin reference only and does not currently block checkout.
      </p>

      {savedLabel && (
        <p
          className="mt-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800"
          style={{ letterSpacing: '-0.14px' }}
        >
          Inventory updated for {savedLabel}.
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-black/[0.06]">
        <table className="min-w-full divide-y divide-black/[0.06] text-sm">
          <thead>
            <tr className="bg-black/[0.02]">
              {['Size', 'Color', 'SKU', 'Inventory', 'Updated', ''].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left font-mono text-[10px] font-normal uppercase tracking-[0.54px] text-black/45"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04]">
            {variants.map((v) => {
              const updated = formatUpdated(v.inventoryUpdatedAt, v.inventoryUpdatedBy)
              return (
                <tr key={v.id} className="transition-colors hover:bg-black/[0.02]">
                  <td className="px-4 py-3 text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                    {v.size}
                  </td>
                  <td className="px-4 py-3 text-black" style={{ letterSpacing: '-0.14px' }}>
                    {v.color}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-black/50">{v.sku}</td>
                  <td className="px-4 py-3">
                    <VariantInventoryBadge variant={v} />
                  </td>
                  <td className="px-4 py-3 text-xs text-black/45" style={{ letterSpacing: '-0.14px' }}>
                    {updated ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => { setSavedLabel(null); setEditTarget(v) }}
                      className="rounded-[50px] border border-black/[0.10] bg-white px-3 py-1 text-xs text-black/50 transition-colors hover:border-black/25 hover:text-black"
                      style={{ letterSpacing: '-0.14px' }}
                    >
                      Edit inventory
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <VariantInventoryModal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        productId={productId}
        variant={editTarget}
        onSaved={handleSaved}
      />
    </section>
  )
}

function Header() {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Inventory</p>
      <h2 className="mt-1 text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
        Stock levels
      </h2>
    </div>
  )
}
