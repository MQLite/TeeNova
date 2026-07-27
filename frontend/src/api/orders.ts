import { apiClient, type ApiClient } from '@/lib/api-client'
import type {
  AdminOnlinePaymentSession,
  AdjustOrderPriceInput,
  BannerDetailInput,
  CreateOnlinePaymentQuoteInput,
  CreateOnlinePaymentSessionInput,
  DeliveryMethod,
  OnlinePaymentQuote,
  OnlinePaymentSession,
  Order,
  OrderContentQuoteResult,
  OrderStatus,
  PagedResult,
  PaymentProvider,
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

export interface CreateOrderItemPayload {
  productId: string
  /** Garment variant: required for garments (server-enforced), omitted for Badge (Jira 9503/9504). */
  productVariantId?: string
  quantity: number
  // ── Item-level design (Jira 9504) — used by non-garment items (Badge). Garment design is per-print.
  // NEVER carries price fields: the backend is the sole pricing authority.
  uploadedAssetId?: string
  uploadedAssetUrl?: string
  designNote?: string
  /** Reserved non-garment configuration (legacy; superseded by {@link bannerDetail}). */
  configurationJson?: string
  /**
   * Banner configuration (Jira 9517). Required for a FixedSize Banner item — carries `sizeMode='Preset'`
   * + the selected `sizePresetId` plus non-priced material/finishing/stand/notes. The backend prices the
   * line from the resolved option (unit × quantity) and snapshots trusted size values. No price fields.
   */
  bannerDetail?: BannerDetailInput
  prints?: CreateOrderItemPrintPayload[]
}

export interface CreateOrderPayload {
  customerEmail: string
  shippingAddress: ShippingAddress
  items: CreateOrderItemPayload[]
  notes?: string
  deliveryMethod?: DeliveryMethod
}

/**
 * Draft payment-quote request: the same price-free item payload used to create the order, plus the
 * delivery method and provider. Deliberately carries no price, subtotal, surcharge or total — the backend
 * prices the draft itself and is the sole monetary authority.
 */
export interface DraftOnlinePaymentQuotePayload {
  provider?: PaymentProvider
  deliveryMethod?: DeliveryMethod
  items: CreateOrderItemPayload[]
}

export function makeOrdersApi(client: ApiClient) {
  return {
    create(payload: CreateOrderPayload): Promise<Order> {
      return client.post('/api/orders', payload)
    },

    getById(id: string): Promise<Order> {
      return client.get(`/api/orders/${id}`)
    },

    getAdminOnlinePaymentSessions(id: string): Promise<AdminOnlinePaymentSession[]> {
      return client.get(`/api/admin/orders/${id}/online-payment-sessions`)
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
      return client.post(`/api/orders/${orderId}/online-payment-session`, input)
    },

    /**
     * Read-only payment quote for a cart that has not been placed yet, so the surcharge can be disclosed
     * before the customer commits. Creates no order, no payment session and no payment record.
     */
    getDraftOnlinePaymentQuote(payload: DraftOnlinePaymentQuotePayload): Promise<OnlinePaymentQuote> {
      return client.post('/api/orders/online-payment-quote', payload)
    },

    /**
     * Read-only payment quote for an existing order. The returned purpose/baseAmount reflect what is
     * actually payable now (e.g. an outstanding pickup deposit, not the whole balance).
     */
    getExistingOrderOnlinePaymentQuote(
      orderId: string,
      input: CreateOnlinePaymentQuoteInput,
    ): Promise<OnlinePaymentQuote> {
      return client.post(`/api/orders/${orderId}/online-payment-quote`, input)
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
