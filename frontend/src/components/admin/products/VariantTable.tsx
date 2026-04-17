import type { ProductVariant } from '@/types'

interface Props {
  variants: ProductVariant[]
  basePrice: number
  confirmDeleteId: string | null
  deleteLoading: boolean
  onEdit: (variant: ProductVariant) => void
  onDeleteRequest: (id: string) => void
  onDeleteConfirm: (id: string) => void
  onDeleteCancel: () => void
}

export function VariantTable({
  variants,
  basePrice,
  confirmDeleteId,
  deleteLoading,
  onEdit,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: Props) {
  return (
    <div className="card overflow-hidden">
      <table className="min-w-full divide-y divide-black/[0.06] text-sm">
        <thead>
          <tr className="bg-black/[0.02]">
            {['Size', 'Color', 'SKU', 'Available', 'Pricing', 'Stock', ''].map((h) => (
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
          {variants.map((v) => (
            <tr key={v.id} className="group transition-colors hover:bg-black/[0.02]">

              {/* Size */}
              <td className="px-4 py-3 text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                {v.size}
              </td>

              {/* Color */}
              <td className="px-4 py-3 text-black" style={{ letterSpacing: '-0.14px' }}>
                {v.color}
              </td>

              {/* SKU */}
              <td className="px-4 py-3 font-mono text-[11px] text-black/50">
                {v.sku}
              </td>

              {/* Available badge */}
              <td className="px-4 py-3">
                {v.isAvailable ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-green-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    Yes
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                    <span className="h-1.5 w-1.5 rounded-full bg-black/25" />
                    No
                  </span>
                )}
              </td>

              {/* Pricing: final price (prominent) + adjustment annotation (when non-zero) */}
              <td className="px-4 py-3">
                <span className="block text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                  ${(basePrice + v.priceAdjustment).toFixed(2)}
                </span>
                {v.priceAdjustment !== 0 && (
                  <span className="block font-mono text-[10px] text-black/40">
                    {v.priceAdjustment > 0 ? '+' : '−'}${Math.abs(v.priceAdjustment).toFixed(2)} adj.
                  </span>
                )}
              </td>

              {/* Stock quantity */}
              <td className="px-4 py-3 text-black/55" style={{ letterSpacing: '-0.14px' }}>
                {v.stockQuantity}
              </td>

              {/* Actions */}
              <td className="px-4 py-3 text-right">
                {confirmDeleteId === v.id ? (
                  <div className="inline-flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-red-600">
                      Delete?
                    </span>
                    <button
                      onClick={() => onDeleteConfirm(v.id)}
                      disabled={deleteLoading}
                      className="rounded-[50px] bg-red-600 px-3 py-1 text-xs text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ letterSpacing: '-0.14px' }}
                    >
                      Yes
                    </button>
                    <button
                      onClick={onDeleteCancel}
                      disabled={deleteLoading}
                      className="rounded-[50px] border border-black/[0.10] bg-white px-3 py-1 text-xs text-black/55 transition-colors hover:border-black/25 hover:text-black disabled:opacity-50"
                      style={{ letterSpacing: '-0.14px' }}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      onClick={() => onEdit(v)}
                      className="rounded-[50px] border border-black/[0.10] bg-white px-3 py-1 text-xs text-black/50 transition-colors hover:border-black/25 hover:text-black"
                      style={{ letterSpacing: '-0.14px' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDeleteRequest(v.id)}
                      className="rounded-[50px] border border-red-200/60 bg-white px-3 py-1 text-xs text-red-500/70 transition-colors hover:border-red-300 hover:text-red-600"
                      style={{ letterSpacing: '-0.14px' }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
