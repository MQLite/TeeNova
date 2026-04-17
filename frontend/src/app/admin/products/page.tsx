'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { EmptyState } from '@/components/admin/products/EmptyState'
import { ProductsTable } from '@/components/admin/products/ProductsTable'
import { ProductHeader } from '@/components/admin/products/ProductHeader'
import type { ProductListItem } from '@/types'

type StatusFilter = 'all' | 'active' | 'inactive'

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
]

export default function AdminProductsPage() {
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [products, setProducts]         = useState<ProductListItem[]>([])
  const [totalCount, setTotalCount]     = useState(0)
  const [loading, setLoading]           = useState(true)

  const isFirstRender = useRef(true)
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const delay = isFirstRender.current ? 0 : 300
    isFirstRender.current = false

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const isActive =
          statusFilter === 'active'   ? true  :
          statusFilter === 'inactive' ? false : undefined

        const result = await catalogApi.getProducts({
          search: search.trim() || undefined,
          isActive,
          maxResultCount: 100,
        })
        setProducts(result.items)
        setTotalCount(result.totalCount)
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
    <div className="admin-page admin-stack">
      <ProductHeader
        title="Products"
        subtitle={loading ? 'Loading…' : `${totalCount} product${totalCount !== 1 ? 's' : ''} in catalogue`}
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

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={[
              'flex-shrink-0 rounded-[50px] px-4 py-2 text-sm transition-all',
              statusFilter === tab.value
                ? 'bg-black text-white shadow-sm'
                : 'border border-black/[0.08] bg-white text-black/50 hover:border-black/20 hover:text-black',
            ].join(' ')}
            style={{ letterSpacing: '-0.14px' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search toolbar */}
      <div className="admin-toolbar">
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
            placeholder="Search products…"
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

        {isFiltered && !loading && (
          <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
            {products.length} result{products.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="card overflow-hidden">
          <div className="animate-pulse divide-y divide-black/[0.04]">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <div className="h-3.5 w-40 rounded-full bg-black/[0.06]" />
                <div className="h-3 w-16 rounded-full bg-black/[0.04]" />
                <div className="h-3 w-14 rounded-full bg-black/[0.04]" />
                <div className="ml-auto h-3 w-10 rounded-full bg-black/[0.04]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && products.length > 0 && (
        <ProductsTable products={products} />
      )}

      {/* Empty states */}
      {!loading && products.length === 0 && !isFiltered && (
        <EmptyState
          title="No products yet"
          description="Add your first product to start building your catalogue."
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
      )}

      {!loading && products.length === 0 && isFiltered && (
        <EmptyState
          title="No products match"
          description="Try adjusting your search or filter to find what you're looking for."
          action={
            <button
              onClick={() => { setSearch(''); setStatusFilter('all') }}
              className="rounded-full border border-black/[0.10] bg-white px-4 py-2 text-sm text-black/55 transition-colors hover:border-black/25 hover:text-black"
              style={{ letterSpacing: '-0.14px' }}
            >
              Clear filters
            </button>
          }
        />
      )}
    </div>
  )
}
