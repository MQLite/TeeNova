'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { ProductForm, type ProductFormValues } from '@/components/admin/products/ProductForm'
import type { Product } from '@/types'

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get('from')
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    catalogApi.getProduct(id)
      .then(setProduct)
      .finally(() => setLoading(false))
  }, [id])

  const backHref = from === 'list' ? '/admin/products' : `/admin/products/${id}`
  const backLabel = from === 'list' ? 'Back to Products' : `Back to ${product?.name ?? 'Product'}`

  async function handleSubmit(values: ProductFormValues) {
    setSaving(true)
    try {
      await catalogApi.updateProduct(id, {
        name: values.name,
        description: values.description || null,
        basePrice: parseFloat(values.basePrice),
        productType: values.productType,
        isActive: values.isActive,
      })
      router.push(backHref)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-page animate-pulse space-y-6">
        <div className="h-4 w-32 rounded-full bg-black/[0.06]" />
        <div className="h-8 w-64 rounded-full bg-black/[0.06]" />
        <div className="h-64 rounded-[28px] bg-black/[0.04]" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="admin-page flex flex-col items-center justify-center py-20 text-center">
        <p className="text-4xl text-black/15" style={{ fontWeight: 320, letterSpacing: '-1.72px' }}>404</p>
        <p className="mt-1 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>Product not found.</p>
        <Link href="/admin/products"
          className="mt-4 text-sm text-black/50 underline underline-offset-2 hover:text-black"
          style={{ letterSpacing: '-0.14px' }}>
          Back to Products
        </Link>
      </div>
    )
  }

  const initialValues: ProductFormValues = {
    name: product.name,
    description: product.description ?? '',
    basePrice: product.basePrice.toString(),
    productType: product.productType,
    isActive: product.isActive,
  }

  return (
    <div className="admin-page admin-stack">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55 transition-colors hover:text-black"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {backLabel}
        </Link>
      </div>

      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Admin Catalogue</p>
        <h1 className="mt-1 text-2xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
          Edit Product
        </h1>
        <p className="mt-1 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
          {product.name}
        </p>
      </div>

      <div className="rounded-[28px] border border-black/[0.08] bg-white p-6 shadow-card max-w-2xl">
        <ProductForm
          initialValues={initialValues}
          saving={saving}
          onSubmit={handleSubmit}
          onCancel={() => router.push(backHref)}
        />
      </div>
    </div>
  )
}
