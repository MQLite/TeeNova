import { notFound } from 'next/navigation'
import Link from 'next/link'
import { makeCatalogApi } from '@/api/catalog'
import { makeAdminApiClient, redirectToExpiredLogin } from '@/lib/auth'
import { ApiError } from '@/lib/api-client'
import { ProductHeader } from '@/components/admin/products/ProductHeader'
import { ProductDetailBody } from './ProductDetailBody'

export const metadata = { title: 'Product Detail' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminProductDetailPage({ params }: PageProps) {
  const { id } = await params

  const catalogApi = makeCatalogApi(await makeAdminApiClient())
  let product
  try {
    product = await catalogApi.getProduct(id)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirectToExpiredLogin(`/admin/products/${id}`)
    notFound()
  }

  return (
    <div className="admin-page admin-stack">
      <div className="mb-4">
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

      <ProductHeader
        eyebrow="Product Detail"
        title={product.name}
        subtitle={`${product.variants.length} variant${product.variants.length !== 1 ? 's' : ''} - ${product.productType}`}
        action={
          <Link
            href={`/admin/products/${product.id}/edit?from=detail`}
            className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm text-white transition-opacity hover:opacity-85"
            style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit Product
          </Link>
        }
      />

      <ProductDetailBody product={product} />
    </div>
  )
}
