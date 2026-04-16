'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { ProductForm, type ProductFormValues } from '@/components/admin/products/ProductForm'

export default function NewProductPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function handleSubmit(values: ProductFormValues) {
    setSaving(true)
    try {
      const product = await catalogApi.createProduct({
        name: values.name,
        description: values.description || null,
        basePrice: parseFloat(values.basePrice),
        productType: values.productType,
        isActive: values.isActive,
      })
      router.push(`/admin/products/${product.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page admin-stack">
      <div>
        <Link
          href="/admin/products"
          className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55 transition-colors hover:text-black"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Products
        </Link>
      </div>

      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Admin Catalogue</p>
        <h1 className="mt-1 text-2xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
          New Product
        </h1>
        <p className="mt-1 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
          Create a base product. Variants and images can be added after saving.
        </p>
      </div>

      <div className="rounded-[28px] border border-black/[0.08] bg-white p-6 shadow-card max-w-2xl">
        <ProductForm
          saving={saving}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/admin/products')}
        />
      </div>
    </div>
  )
}
