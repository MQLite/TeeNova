import { apiClient } from '@/lib/api-client'
import type { Order, OrderStatus, PagedResult, PrintPosition, ShippingAddress } from '@/types'

export interface CreateOrderPayload {
  customerEmail: string
  shippingAddress: ShippingAddress
  items: {
    productId: string
    productVariantId: string
    quantity: number
    uploadedAssetId?: string
    uploadedAssetUrl?: string
    printPosition?: PrintPosition
    designNote?: string
  }[]
  notes?: string
}

export const ordersApi = {
  create(payload: CreateOrderPayload): Promise<Order> {
    return apiClient.post('/api/orders', payload)
  },

  getById(id: string): Promise<Order> {
    return apiClient.get(`/api/orders/${id}`)
  },

  getList(params?: { skipCount?: number; maxResultCount?: number }): Promise<PagedResult<Order>> {
    return apiClient.get('/api/orders', {
      skipCount: params?.skipCount ?? 0,
      maxResultCount: params?.maxResultCount ?? 20,
    })
  },

  updateStatus(id: string, newStatus: OrderStatus, reason?: string): Promise<Order> {
    return apiClient.put(`/api/orders/${id}/status`, { newStatus, reason })
  },
}
