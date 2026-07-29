'use client'

import { CartChildRow } from '@/components/cart/CartChildRow'
import { CartGarmentSubgroup } from '@/components/cart/CartGarmentSubgroup'
import type { CartProductGroup } from '@/features/cart/cart-grouping'
import type { CartLinePricing } from '@/features/cart/useCartPricing'

interface Props {
  group: CartProductGroup<CartLinePricing>
  onIncrease: (cartItemKey: string) => void
  onDecrease: (cartItemKey: string) => void
  onRemove: (cartItemKey: string) => void
}

const KIND_LABEL: Record<string, string> = {
  Garment: 'Garment',
  Badge: 'Badge',
  Banner: 'Banner',
  Other: 'Custom',
}

/**
 * One product group in the cart (Jira 10102): the product identity is shown once, then every source
 * cart line for that product is rendered as its own editable child row.
 *
 * The group image is deliberately an ARTWORK preview, not a product photo: `CartItem` carries no
 * catalogue image and this task must not add a live product lookup to fetch one, so the first
 * uploaded design in the group is shown and labelled as a design preview.
 */
export function CartProductGroupCard({ group, onIncrease, onDecrease, onRemove }: Props) {
  const designPreviewUrl = findFirstDesignUrl(group)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start gap-4 border-b border-black/[0.08] px-4 py-4 sm:px-5">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/[0.03]">
          {designPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={designPreviewUrl}
              alt={`Uploaded design preview for ${group.productName}`}
              title="Design preview (not a product photo)"
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <svg viewBox="0 0 200 220" className="h-8 w-8 text-black/[0.08]" fill="currentColor">
              <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
            </svg>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
            {group.productName}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
              {KIND_LABEL[group.kind] ?? group.kind}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/50">
              Total quantity: {group.totalQuantity}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
              {group.rows.length} line{group.rows.length !== 1 ? 's' : ''}
            </span>
          </div>
          {designPreviewUrl && (
            <p className="mt-1 text-[11px] text-black/40" style={{ letterSpacing: '-0.14px' }}>
              Design preview — your uploaded artwork, not a product photo.
            </p>
          )}
        </div>
      </div>

      <div className="divide-y divide-black/[0.06]">
        {group.kind === 'Garment'
          ? group.visualSubgroups.map((subgroup) => (
              <CartGarmentSubgroup
                key={subgroup.subgroupKey}
                subgroup={subgroup}
                onIncrease={onIncrease}
                onDecrease={onDecrease}
                onRemove={onRemove}
              />
            ))
          : group.rows.map((row) => (
              <CartChildRow
                key={row.cartItemKey}
                row={row}
                onIncrease={onIncrease}
                onDecrease={onDecrease}
                onRemove={onRemove}
              />
            ))}
      </div>
    </div>
  )
}

/** First uploaded design in the group: item-level (Badge/Banner) or the first per-print upload. */
function findFirstDesignUrl(group: CartProductGroup<CartLinePricing>): string | null {
  for (const row of group.rows) {
    if (row.item.uploadedAssetUrl) return row.item.uploadedAssetUrl
    const print = (row.item.prints ?? []).find((p) => p.uploadedAssetUrl)
    if (print?.uploadedAssetUrl) return print.uploadedAssetUrl
  }
  return null
}
