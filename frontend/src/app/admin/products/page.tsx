import { catalogApi } from '@/api/catalog'
import { Badge } from '@/components/ui/Badge'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { EmptyState } from '@/components/admin/EmptyState'

export const metadata = { title: 'Products' }

export default async function AdminProductsPage() {
  const { items: products, totalCount } = await catalogApi.getProducts({ isActive: undefined, maxResultCount: 100 })

  return (
    <div>
      <AdminPageHeader
        title="Products"
        subtitle={`${totalCount} product${totalCount !== 1 ? 's' : ''} in catalogue`}
        action={
          <button
            disabled
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-400 shadow-sm"
            title="Coming in next phase"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Add Product
          </button>
        }
      />

      {products.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7 text-gray-400">
              <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4z" clipRule="evenodd" />
            </svg>
          }
          title="No products to display"
          description="Add products via the seeder or connect the product management API to manage your catalogue here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['Name', 'Type', 'Base Price', 'Variants', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {products.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3">
                    <Badge color="purple">{p.productType}</Badge>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">${p.basePrice.toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-500">{p.variantCount}</td>
                  <td className="px-4 py-3">
                    <Badge color="green">Active</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
