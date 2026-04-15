import { notFound } from 'next/navigation'
import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { EditPlaceholderButton } from '@/components/admin/products/EditPlaceholderButton'
import { ProductHeader } from '@/components/admin/products/ProductHeader'
import { ProductImageGallery } from '@/components/admin/products/ProductImageGallery'
import { VariantBadge } from '@/components/admin/products/VariantBadge'

export const metadata = { title: 'Product Detail' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

function getPriceRange(basePrice: number, adjustments: number[]) {
  if (adjustments.length === 0) return `$${basePrice.toFixed(2)}`
  const min = Math.min(...adjustments)
  const max = Math.max(...adjustments)
  const start = basePrice + min
  const end = basePrice + max

  if (start === end) return `$${start.toFixed(2)}`
  return `$${start.toFixed(2)} - $${end.toFixed(2)}`
}

export default async function AdminProductDetailPage({ params }: PageProps) {
  const { id } = await params

  let product
  try {
    product = await catalogApi.getProduct(id)
  } catch {
    notFound()
  }

  const adjustments = product.variants.map((variant) => variant.priceAdjustment)

  return (
    <div className="admin-page admin-stack">
      <div className="mb-4">
        <Link href="/admin/products" className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55 transition-colors hover:text-black">
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
        action={<EditPlaceholderButton variant="primary" />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Image Gallery</p>
                <h2 className="mt-1 text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                  Product imagery
                </h2>
              </div>
              <span className="rounded-full border border-black/[0.08] bg-black/[0.02] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
                {product.images.length} image{product.images.length !== 1 ? 's' : ''}
              </span>
            </div>
            <ProductImageGallery name={product.name} images={product.images} />
          </section>

          <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
            <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Description</p>
            <h2 className="mt-1 text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
              Product overview
            </h2>
            <div className="mt-4 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-4 text-sm leading-6 text-black/70">
              {product.description?.trim() || 'No description has been provided for this product yet.'}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
            <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Overview</p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-3xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
                  ${product.basePrice.toFixed(2)}
                </p>
                <p className="mt-1 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
                  Base price
                </p>
              </div>
              <div className="rounded-2xl border border-black/[0.08] bg-black/[0.02] px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Range</p>
                <p className="mt-1 text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                  {getPriceRange(product.basePrice, adjustments)}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Variants</p>
                <h2 className="mt-1 text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                  Sizes and colours
                </h2>
              </div>
              <span className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
                {product.variants.length} total
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {product.variants.map((variant) => (
                <VariantBadge key={variant.id} size={variant.size} color={variant.color} />
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card">
            <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Metadata</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Product ID</p>
                <p className="mt-1 break-all text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                  {product.id}
                </p>
              </div>
              <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Created</p>
                <p className="mt-1 text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                  {new Date(product.creationTime).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Status</p>
                <p className="mt-1 text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                  {product.isActive ? 'Active for storefront' : 'Hidden from storefront'}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

