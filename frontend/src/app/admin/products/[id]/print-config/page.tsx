import { notFound } from 'next/navigation'
import Link from 'next/link'
import { makeCatalogApi } from '@/api/catalog'
import { makeAdminApiClient, redirectToExpiredLogin } from '@/lib/auth'
import { ApiError } from '@/lib/api-client'
import { ProductHeader } from '@/components/admin/products/ProductHeader'
import { PrintConfigPageBody } from './PrintConfigPageBody'

export const metadata = { title: 'Print Config' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminProductPrintConfigPage({ params }: PageProps) {
  const { id } = await params

  const catalogApi = makeCatalogApi(makeAdminApiClient())
  let product
  try {
    product = await catalogApi.getProduct(id)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirectToExpiredLogin(`/admin/products/${id}/print-config`)
    }
    notFound()
  }

  return (
    <div className="admin-page admin-stack">
      <div className="mb-4">
        <Link
          href={`/admin/products/${product.id}`}
          className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55 transition-colors hover:text-black"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Product
        </Link>
      </div>

      <ProductHeader
        eyebrow="Product Setup"
        title="Print Config"
        subtitle={`${product.name} - ${product.variants.length} variant${product.variants.length !== 1 ? 's' : ''}`}
        action={
          <Link
            href={`/admin/products/${product.id}`}
            className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm text-white transition-opacity hover:opacity-85"
            style={{ fontWeight: 480 }}
          >
            Product Detail
          </Link>
        }
      />

      <PrintConfigPageBody product={product} />
    </div>
  )
}
