import Link from 'next/link'
import type { ProductListItem } from '@/types'

interface Props {
  products: ProductListItem[]
}

function ProductStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-[11px] text-green-700">
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-green-500" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
      Inactive
    </span>
  )
}

export function ProductsTable({ products }: Props) {
  return (
    <div className="card overflow-hidden">
      <table className="min-w-full divide-y divide-black/[0.06] text-sm">
        <thead>
          <tr className="bg-black/[0.02]">
            {['Name', 'Type', 'Base Price', 'Variants', 'Status', ''].map((h) => (
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
          {products.map((product) => (
            <tr key={product.id} className="group transition-colors hover:bg-black/[0.02]">
              {/* Name — clickable to detail page */}
              <td className="px-4 py-3">
                <Link
                  href={`/admin/products/${product.id}`}
                  className="text-black hover:underline"
                  style={{ fontWeight: 480, letterSpacing: '-0.14px' }}
                >
                  {product.name}
                </Link>
              </td>

              {/* Product type */}
              <td className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.54px] text-black/50">
                {product.productType}
              </td>

              {/* Base price */}
              <td className="px-4 py-3 text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                ${product.basePrice.toFixed(2)}
              </td>

              {/* Variant count */}
              <td className="px-4 py-3 text-black/55" style={{ letterSpacing: '-0.14px' }}>
                {product.variantCount}
              </td>

              {/* Status badge */}
              <td className="px-4 py-3">
                <ProductStatusBadge isActive={product.isActive} />
              </td>

              {/* Actions — always visible */}
              <td className="px-4 py-3 text-right">
                <div className="inline-flex items-center gap-1.5">
                  <Link
                    href={`/admin/products/${product.id}/edit?from=list`}
                    className="rounded-[50px] border border-black/[0.10] bg-white px-3 py-1 text-xs text-black/50 transition-colors hover:border-black/25 hover:text-black"
                    style={{ letterSpacing: '-0.14px' }}
                  >
                    Edit
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
