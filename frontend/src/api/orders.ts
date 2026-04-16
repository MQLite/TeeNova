import { apiClient } from '@/lib/api-client'
import type { Order, OrderStatus, PagedResult, PrintPosition, ShippingAddress } from '@/types'

export interface CreateOrderItemPositionPayload {
  position: string
  assetId?: string
  assetUrl?: string
  designNote?: string
}

export interface CreateOrderPayload {
  customerEmail: string
  shippingAddress: ShippingAddress
  items: {
    productId: string
    productVariantId: string
    quantity: number
    printPositions: CreateOrderItemPositionPayload[]
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

  markPaid(id: string): Promise<Order> {
    return apiClient.post(`/api/orders/${id}/mark-paid`)
  },

  startReview(id: string): Promise<Order> {
    return apiClient.post(`/api/orders/${id}/start-review`)
  },

  reopen(id: string): Promise<Order> {
    return apiClient.post(`/api/orders/${id}/reopen`)
  },

  updateChecklist(
    id: string,
    payload: {
      isDesignReviewed: boolean
      isPrintPositionConfirmed: boolean
      isFileDownloaded: boolean
      isGarmentConfirmed: boolean
      isReadyToPrint: boolean
    },
  ): Promise<Order> {
    return apiClient.put(`/api/orders/${id}/checklist`, payload)
  },

  recordNotification(id: string): Promise<Order> {
    return apiClient.post(`/api/orders/${id}/record-notification`)
  },

  updateAdminNotes(id: string, adminNotes: string | null): Promise<Order> {
    return apiClient.put(`/api/orders/${id}/notes`, { adminNotes })
  },

  approveForPrinting(id: string): Promise<Order> {
    return apiClient.post(`/api/orders/${id}/approve-for-printing`)
  },

  startPrinting(id: string): Promise<Order> {
    return apiClient.post(`/api/orders/${id}/start-printing`)
  },

  markReady(id: string): Promise<Order> {
    return apiClient.post(`/api/orders/${id}/mark-ready`)
  },

  complete(id: string): Promise<Order> {
    return apiClient.post(`/api/orders/${id}/complete`)
  },

  updateItemDesign(
    orderId: string,
    itemId: string,
    payload: {
      position: PrintPosition
      uploadedAssetId?: string
      uploadedAssetUrl?: string
      designNote?: string
    },
  ): Promise<import('@/types').OrderItem> {
    return apiClient.put(`/api/orders/${orderId}/items/${itemId}/design`, payload)
  },
}
