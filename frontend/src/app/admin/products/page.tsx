import { catalogApi } from '@/api/catalog'
import { EditPlaceholderButton } from '@/components/admin/products/EditPlaceholderButton'
import { EmptyState } from '@/components/admin/products/EmptyState'
import { ProductGrid } from '@/components/admin/products/ProductGrid'
import { ProductHeader } from '@/components/admin/products/ProductHeader'

export const metadata = { title: 'Products' }
export const dynamic = 'force-dynamic'

export default async function AdminProductsPage() {
  const { items: products, totalCount } = await catalogApi.getProducts({ isActive: undefined, maxResultCount: 100 })

  return (
    <div className="admin-page admin-stack">
      <ProductHeader
        title="Products"
        subtitle={`${totalCount} product${totalCount !== 1 ? 's' : ''} in catalogue`}
        eyebrow="Admin Catalogue"
        action={
          <EditPlaceholderButton label="Add Product" variant="primary" />
        }
      />

      <div className="admin-toolbar mb-6 rounded-[24px] shadow-card">
        <div className="relative max-w-md flex-1">
          <svg className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            readOnly
            value=""
            placeholder="Search products, colors, or sizes"
            className="w-full rounded-full border border-black/[0.10] bg-black/[0.02] px-11 py-2.5 text-sm text-black placeholder:text-black/35"
            aria-label="Search products placeholder"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-black/[0.08] bg-black/[0.02] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
            Demo View
          </span>
          <span className="rounded-full border border-black/[0.08] bg-white px-3 py-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
            {totalCount} live products
          </span>
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="No products to display"
          description="Products will appear here once the catalogue is seeded or connected to the product management workflow."
        />
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  )
}
