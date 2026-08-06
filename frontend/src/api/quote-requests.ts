import { apiClient, type ApiClient } from '@/lib/api-client'
import { adminApiClient, type AdminApiClient } from '@/lib/admin-client'
import type {
  PagedResult, QuoteAttachmentToken, QuoteRequest, QuoteRequestPayload,
  QuoteRequestResult, QuoteRequestStatus, QuoteRequestSummary, QuoteServiceType,
} from '@/types'

export function makeQuoteRequestsApi(client: ApiClient) {
  return {
    upload(file: File): Promise<QuoteAttachmentToken> {
      return client.uploadFile('/api/quote-requests/attachments', file)
    },
    create(payload: QuoteRequestPayload): Promise<QuoteRequestResult> {
      return client.post('/api/quote-requests', payload)
    },
  }
}

export const quoteRequestsApi = makeQuoteRequestsApi(apiClient)

export function makeAdminQuoteRequestsApi(client: AdminApiClient) {
  return {
    list(params?: { status?: QuoteRequestStatus; serviceType?: QuoteServiceType; skipCount?: number; maxResultCount?: number }): Promise<PagedResult<QuoteRequestSummary>> {
      return client.get('/api/quote-requests', {
        status: params?.status, serviceType: params?.serviceType,
        skipCount: params?.skipCount ?? 0, maxResultCount: params?.maxResultCount ?? 50,
      })
    },
    get(id: string): Promise<QuoteRequest> { return client.get(`/api/quote-requests/${id}`) },
    markReviewed(id: string): Promise<QuoteRequest> { return client.post(`/api/quote-requests/${id}/mark-reviewed`) },
    cancel(id: string): Promise<QuoteRequest> { return client.post(`/api/quote-requests/${id}/cancel`) },
    markSpam(id: string): Promise<QuoteRequest> { return client.post(`/api/quote-requests/${id}/mark-spam`) },
    resend(id: string, channel: 'internal' | 'customer'): Promise<QuoteRequest> {
      return client.post(`/api/quote-requests/${id}/resend-notification`, { channel })
    },
    attachmentDownloadUrl(id: string, attachmentId: string): string {
      return `/api/admin/quote-requests/${id}/attachments/${attachmentId}`
    },
  }
}

export const adminQuoteRequestsApi = makeAdminQuoteRequestsApi(adminApiClient)
