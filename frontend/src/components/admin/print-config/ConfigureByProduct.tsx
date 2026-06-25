'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { makeCatalogApi } from '@/api/catalog'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import { SkeletonTable } from '@/components/admin/LoadingSkeleton'
import type { ProductListItem } from '@/types'

const catalogApi = makeCatalogApi(adminApiClient)

type StatusFilter = 'all' | 'active' | 'inactive'

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
]

function StatusBadge({ isActive }: { isActive: boolean }) {
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

export function ConfigureByProduct() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [products, setProducts] = useState<ProductListItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const isFirstRender = useRef(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const delay = isFirstRender.current ? 0 : 300
    isFirstRender.current = false

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const isActive =
          statusFilter === 'active' ? true :
          statusFilter === 'inactive' ? false : undefined

        const result = await catalogApi.getProducts({
          search: search.trim() || undefined,
          isActive,
          maxResultCount: 100,
        })
        setProducts(result.items)
        setTotalCount(result.totalCount)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          redirectToLogin('session-expired')
          return
        }
      } finally {
        setLoading(false)
      }
    }, delay)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search, statusFilter])

  const hasSearch = search.trim().length > 0
  const isFiltered = hasSearch || statusFilter !== 'all'

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
            Product Scope
          </p>
          <h2 className="text-lg text-black" style={{ fontWeight: 540 }}>
            Configure by Product
          </h2>
          <p className="text-sm leading-6 text-black/55">
            Choose a product to manage its print pricing group, print-only prices, and customer-selectable print options.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-sm">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-black/45"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-full border border-black/[0.10] bg-black/[0.02] py-2 pl-9 pr-9 text-sm text-black placeholder:text-black/35 focus:border-black/25 focus:outline-none"
            />
            {hasSearch && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-black/35 transition-colors hover:text-black"
                aria-label="Clear search"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={[
                  'flex-shrink-0 rounded-[50px] px-3 py-1.5 text-xs transition-all',
                  statusFilter === tab.value
                    ? 'bg-black text-white shadow-sm'
                    : 'border border-black/[0.08] bg-white text-black/50 hover:border-black/20 hover:text-black',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {!loading && (
          <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
            {products.length} shown of {totalCount}
          </p>
        )}
      </div>

      {loading && <SkeletonTable rows={5} cols={6} />}

      {!loading && products.length > 0 && (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-black/[0.06] text-sm">
            <thead>
              <tr className="bg-black/[0.02]">
                {['Product', 'Type', 'Base Price', 'Variants', 'Status', ''].map((heading) => (
                  <th
                    key={heading}
                    className="px-4 py-3 text-left font-mono text-[10px] font-normal uppercase tracking-[0.54px] text-black/45"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {products.map((product) => (
                <tr key={product.id} className="transition-colors hover:bg-black/[0.02]">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/print-config/products/${product.id}`}
                      className="text-black hover:underline"
                      style={{ fontWeight: 480 }}
                    >
                      {product.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.54px] text-black/50">
                    {product.productType}
                  </td>
                  <td className="px-4 py-3 text-black" style={{ fontWeight: 480 }}>
                    ${product.basePrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-black/55">
                    {product.variantCount}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge isActive={product.isActive} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/print-config/products/${product.id}`}
                      className="inline-flex items-center justify-center rounded-[50px] bg-black px-3 py-1 text-xs text-white transition-opacity hover:opacity-85"
                    >
                      Configure
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && products.length === 0 && (
        <div className="rounded-[28px] border border-black/[0.08] bg-white p-8 text-center shadow-card">
          <h3 className="text-base text-black" style={{ fontWeight: 540 }}>
            {isFiltered ? 'No products match' : 'No products yet'}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-black/55">
            {isFiltered
              ? 'Try adjusting the search or status filter.'
              : 'Products will appear here once they have been added to the catalogue.'}
          </p>
        </div>
      )}
    </div>
  )
}
