import { apiClient, type ApiClient } from '@/lib/api-client'
import type {
  AdjustOrderPriceInput,
  CreateOnlinePaymentSessionInput,
  DeliveryMethod,
  OnlinePaymentSession,
  Order,
  OrderContentQuoteResult,
  OrderStatus,
  PagedResult,
  RecordPaymentInput,
  ShippingAddress,
  UpdateOrderContent,
} from '@/types'

export interface CreateOrderItemPrintPayload {
  printAreaId: string
  printSizeId: string
  uploadedAssetId?: string
  uploadedAssetUrl?: string
  designNote?: string
}

export interface CreateOrderPayload {
  customerEmail: string
  shippingAddress: ShippingAddress
  items: {
    productId: string
    productVariantId: string
    quantity: number
    prints?: CreateOrderItemPrintPayload[]
  }[]
  notes?: string
  deliveryMethod?: DeliveryMethod
}

export function makeOrdersApi(client: ApiClient) {
  return {
    create(payload: CreateOrderPayload): Promise<Order> {
      return client.post('/api/orders', payload)
    },

    getById(id: string): Promise<Order> {
      return client.get(`/api/orders/${id}`)
    },

    getList(params?: { skipCount?: number; maxResultCount?: number }): Promise<PagedResult<Order>> {
      return client.get('/api/orders', {
        skipCount: params?.skipCount ?? 0,
        maxResultCount: params?.maxResultCount ?? 20,
      })
    },

    delete(id: string): Promise<void> {
      return client.delete(`/api/orders/${id}`)
    },

    updateStatus(id: string, newStatus: OrderStatus, reason?: string): Promise<Order> {
      return client.put(`/api/orders/${id}/status`, { newStatus, reason })
    },

    markPaid(id: string): Promise<Order> {
      return client.post(`/api/orders/${id}/mark-paid`)
    },

    startReview(id: string): Promise<Order> {
      return client.post(`/api/orders/${id}/start-review`)
    },

    reopen(id: string): Promise<Order> {
      return client.post(`/api/orders/${id}/reopen`)
    },

    recordNotification(id: string): Promise<Order> {
      return client.post(`/api/orders/${id}/record-notification`)
    },

    updateAdminNotes(id: string, adminNotes: string | null): Promise<Order> {
      return client.put(`/api/orders/${id}/notes`, { adminNotes })
    },

    approveForPrinting(id: string): Promise<Order> {
      return client.post(`/api/orders/${id}/approve-for-printing`)
    },

    startPrinting(id: string): Promise<Order> {
      return client.post(`/api/orders/${id}/start-printing`)
    },

    markReady(id: string): Promise<Order> {
      return client.post(`/api/orders/${id}/mark-ready`)
    },

    complete(id: string): Promise<Order> {
      return client.post(`/api/orders/${id}/complete`)
    },

    recordPayment(orderId: string, input: RecordPaymentInput): Promise<Order> {
      return client.post(`/api/orders/${orderId}/record-payment`, input)
    },

    adjustPrice(orderId: string, input: AdjustOrderPriceInput): Promise<Order> {
      return client.post(`/api/orders/${orderId}/adjust-price`, input)
    },

    createOnlinePaymentSession(
      orderId: string,
      input: CreateOnlinePaymentSessionInput,
    ): Promise<OnlinePaymentSession> {
      return client.post(`/api/app/order/${orderId}/online-payment-session`, input)
    },

    updatePrintDesign(
      orderId: string,
      printId: string,
      payload: {
        uploadedAssetId?: string | null
        uploadedAssetUrl?: string | null
        designNote?: string | null
      },
    ): Promise<Order> {
      return client.put(`/api/orders/${orderId}/prints/${printId}/design`, payload)
    },

    // ── Admin order-content edit (Jira 9405/9406) ──────────────────────────────
    // Admin-only routes under /api/admin/orders. Must be called through the admin
    // (authenticated) client — never the anonymous customer order route.

    /** Preview a content change: reprices the whole order and returns payment impact. No persistence. */
    quoteContentUpdate(orderId: string, payload: UpdateOrderContent): Promise<OrderContentQuoteResult> {
      return client.post(`/api/admin/orders/${orderId}/content/quote`, payload)
    },

    /** Validate, reprice and persist a content change; returns the fresh order (with PrintGroups). */
    updateContent(orderId: string, payload: UpdateOrderContent): Promise<Order> {
      return client.put(`/api/admin/orders/${orderId}/content`, payload)
    },
  }
}

export const ordersApi = makeOrdersApi(apiClient)
