import { ordersApi } from '@/api/orders'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { EmptyState } from '@/components/admin/EmptyState'
import { OrdersTable } from '@/components/admin/OrdersTable'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Orders' }

export default async function AdminOrdersPage() {
  const { items: orders, totalCount } = await ordersApi.getList({ maxResultCount: 100 })

  return (
    <div>
      <AdminPageHeader
        title="Orders"
        subtitle={`${totalCount} order${totalCount !== 1 ? 's' : ''} total`}
      />

      {orders.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7 text-gray-400">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
          }
          title="No orders yet"
          description="Orders will appear here once customers place them through the storefront."
        />
      ) : (
        <OrdersTable orders={orders} />
      )}
    </div>
  )
}
