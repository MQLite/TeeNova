import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { EmptyState } from '@/components/admin/products/EmptyState'
import { ProductGrid } from '@/components/admin/products/ProductGrid'
import { ProductHeader } from '@/components/admin/products/ProductHeader'

export const metadata = { title: 'Products' }
export const dynamic = 'force-dynamic'

export default async function AdminProductsPage() {
  // isActive omitted — admin sees all products regardless of status
  const { items: products, totalCount } = await catalogApi.getProducts({ maxResultCount: 100 })

  const activeCount = products.filter((p) => p.isActive).length

  return (
    <div className="admin-page admin-stack">
      <ProductHeader
        title="Products"
        subtitle={`${totalCount} product${totalCount !== 1 ? 's' : ''} in catalogue`}
        eyebrow="Admin Catalogue"
        action={
          <Link
            href="/admin/products/new"
            className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm text-white transition-opacity hover:opacity-85"
            style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Product
          </Link>
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
          <span className="rounded-full border border-green-200 bg-green-50 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.54px] text-green-700">
            {activeCount} active
          </span>
          <span className="rounded-full border border-black/[0.08] bg-white px-3 py-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
            {totalCount} total
          </span>
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Add your first product to get started."
        />
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  )
}
