import { catalogApi } from '@/api/catalog'
import { Badge } from '@/components/ui/Badge'

export const metadata = { title: 'Products' }

export default async function AdminProductsPage() {
  const { items: products, totalCount } = await catalogApi.getProducts({ isActive: undefined, maxResultCount: 100 })

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        <span className="text-sm text-gray-500">{totalCount} total</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Name', 'Type', 'Base Price', 'Variants', 'Status'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-4 py-3"><Badge color="purple">{p.productType}</Badge></td>
                <td className="px-4 py-3 font-semibold">${p.basePrice.toFixed(2)}</td>
                <td className="px-4 py-3 text-gray-500">{p.variantCount}</td>
                <td className="px-4 py-3">
                  <Badge color="green">Active</Badge>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-gray-400">No products yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
