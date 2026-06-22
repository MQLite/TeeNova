'use client'

import { useEffect, useState } from 'react'
import { makeCatalogApi } from '@/api/catalog'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import { ProductHeader } from '@/components/admin/products/ProductHeader'
import { StockMatrix } from '@/components/admin/inventory/StockMatrix'
import type { Product, ProductListItem } from '@/types'

const catalogApi = makeCatalogApi(adminApiClient)

export default function AdminInventoryPage() {
  const [products, setProducts] = useState<ProductListItem[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [product, setProduct] = useState<Product | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingProduct, setLoadingProduct] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load the product list once and auto-select the first product.
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const result = await catalogApi.getProducts({ maxResultCount: 100 })
        if (!active) return
        setProducts(result.items)
        setSelectedId((prev) => prev || result.items[0]?.id || '')
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
        if (active) setError('Could not load products.')
      } finally {
        if (active) setLoadingList(false)
      }
    })()
    return () => { active = false }
  }, [])

  // Load the selected product's variants whenever the selection changes.
  useEffect(() => {
    if (!selectedId) { setProduct(null); return }
    let active = true
    setLoadingProduct(true)
    setError(null)
    ;(async () => {
      try {
        const p = await catalogApi.getProduct(selectedId)
        if (active) setProduct(p)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
        if (active) { setProduct(null); setError('Could not load this product.') }
      } finally {
        if (active) setLoadingProduct(false)
      }
    })()
    return () => { active = false }
  }, [selectedId])

  const variants = product?.variants ?? []

  return (
    <div className="admin-page admin-stack">
      <ProductHeader
        title="Stock"
        eyebrow="Admin Inventory"
        subtitle="Record on-hand inventory per product variant, in a size × colour matrix."
      />

      {/* Product selector */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">Product</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={loadingList || products.length === 0}
          className="min-w-[240px] rounded-2xl border border-black/[0.10] bg-white px-4 py-2.5 text-sm text-black focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/[0.06] disabled:opacity-50"
        >
          {loadingList && <option>Loading…</option>}
          {!loadingList && products.length === 0 && <option value="">No products</option>}
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" style={{ letterSpacing: '-0.14px' }}>
          {error}
        </p>
      )}

      <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
        {loadingProduct && (
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-40 rounded-full bg-black/[0.06]" />
            <div className="h-24 w-full rounded-2xl bg-black/[0.04]" />
          </div>
        )}

        {!loadingProduct && product && variants.length > 0 && (
          <>
            <div className="mb-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">{product.name}</p>
              <h2 className="mt-1 text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                Stock matrix
              </h2>
            </div>
            <StockMatrix key={product.id} productId={product.id} variants={variants} />
          </>
        )}

        {!loadingProduct && product && variants.length === 0 && (
          <p className="rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-4 text-sm text-black/55">
            This product has no variants yet. Add sizes and colours on the product page first.
          </p>
        )}

        {!loadingProduct && !product && !error && !loadingList && (
          <p className="rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-4 text-sm text-black/55">
            Select a product to manage its stock.
          </p>
        )}
      </section>
    </div>
  )
}
