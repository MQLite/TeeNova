import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { ProductCard } from '@/components/products/ProductCard'

interface PageProps {
  searchParams: Promise<{ search?: string; type?: string; page?: string }>
}

export const metadata = { title: 'Products — Browse Our Collection' }

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Number(params.page ?? 1)
  const pageSize = 12

  const { items, totalCount } = await catalogApi.getProducts({
    search: params.search,
    productType: params.type,
    skipCount: (page - 1) * pageSize,
    maxResultCount: pageSize,
  })

  return (
    <>
      {/* Page header */}
      <section className="border-b border-black/[0.08] py-14">
        <div className="section-container">
          <nav className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
            <Link href="/" className="hover:text-black transition-colors">Home</Link>
            <span className="opacity-40">›</span>
            <span className="text-black">Products</span>
          </nav>
          <h1 className="display-section mb-4">Our Collection</h1>
          <p className="text-base text-black/50" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
            Premium custom garments ready for your design.
            <span className="ml-2 rounded-full border border-black/[0.08] px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
              {totalCount} product{totalCount !== 1 ? 's' : ''}
            </span>
          </p>
        </div>
      </section>

      {/* Grid */}
      <section className="py-12">
        <div className="section-container">

          {/* Filter bar */}
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {['All', 'T-Shirts', 'Hoodies', 'Polo Shirts'].map((f) => (
                <button
                  key={f}
                  className={`rounded-[50px] border px-4 py-1.5 text-sm transition-colors ${
                    f === 'All'
                      ? 'border-black bg-black text-white'
                      : 'border-black/[0.12] bg-white text-black/50 hover:border-black/30 hover:text-black'
                  }`}
                  style={{ letterSpacing: '-0.14px' }}
                >
                  {f}
                </button>
              ))}
            </div>
            <p className="text-xs text-black/55" style={{ letterSpacing: '0.02em' }}>
              Showing <strong className="font-medium text-black">{items.length}</strong> of {totalCount}
            </p>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-black/[0.12] py-24 text-center">
              <span className="text-4xl">👕</span>
              <h3 className="mt-4 text-base text-black" style={{ fontWeight: 480, letterSpacing: '-0.26px' }}>
                No products found
              </h3>
              <p className="mt-1 text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
                Try a different filter or check back later.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-black/[0.08] py-16 text-center">
        <div className="section-container max-w-lg">
          <h2
            className="mb-2 text-xl text-black"
            style={{ fontWeight: 540, letterSpacing: '-0.26px' }}
          >
            Can&apos;t find what you need?
          </h2>
          <p className="mb-6 text-sm text-black/50" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
            Contact us for bulk orders, custom product types, or special requests.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href="mailto:hello@otahuhuprinting.co.nz" className="btn-black">
              Contact Us
            </a>
            <Link href="/" className="btn-glass">
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
