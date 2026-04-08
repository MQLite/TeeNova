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
      {/* Page hero */}
      <section className="bg-gradient-to-br from-brand-950 via-brand-800 to-brand-600 py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="mb-4 flex items-center gap-2 text-xs text-brand-300">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>›</span>
            <span className="text-white">Products</span>
          </nav>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Our Collection
          </h1>
          <p className="mt-3 max-w-xl text-lg text-brand-200">
            Premium custom T-shirts ready for your design. All garments available in multiple colours and sizes.
          </p>
          <div className="mt-5 inline-flex items-center rounded-full bg-white/10 px-3 py-1.5 text-sm text-brand-200 backdrop-blur-sm">
            {totalCount} product{totalCount !== 1 ? 's' : ''} available
          </div>
        </div>
      </section>

      {/* Product grid */}
      <section className="bg-gray-50 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

          {/* Filter bar placeholder */}
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {['All', 'T-Shirts', 'Hoodies', 'Polo Shirts'].map((f) => (
                <button
                  key={f}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    f === 'All'
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-brand-300 hover:text-brand-600'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <p className="text-sm text-gray-500">
              Showing <strong className="text-gray-900">{items.length}</strong> of {totalCount} products
            </p>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-28 text-center">
              <span className="text-5xl">👕</span>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">No products found</h3>
              <p className="mt-2 text-sm text-gray-500">Try a different filter or check back later.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-white py-14 text-center">
        <div className="mx-auto max-w-xl px-4">
          <h2 className="text-2xl font-bold text-gray-900">Can&apos;t find what you need?</h2>
          <p className="mt-2 text-gray-500">
            Contact us directly for bulk orders, custom product types, or special requests.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="mailto:hello@otahuhuprinting.co.nz"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shadow-sm"
            >
              Contact Us
            </a>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
