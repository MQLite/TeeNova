import { apiClient, type ApiClient } from '@/lib/api-client'
import { adminApiClient, type AdminApiClient } from '@/lib/admin-client'
import type {
  BannerEnquiryRequest,
  BannerEnquiryResult,
  BannerQuoteRequest,
  BannerQuoteRequestStatus,
  ConvertBannerQuoteRequest,
  ConvertBannerQuoteRequestResult,
  PagedResult,
} from '@/types'

/**
 * Storefront Banner quote enquiry API (Jira 9512). The submit endpoint is anonymous (same as the
 * customer order-create route); it creates a `BannerQuoteRequest`, NOT an order, and never a payment
 * session. There are no price fields anywhere in this client.
 */
export function makeBannerEnquiriesApi(client: ApiClient) {
  return {
    create(payload: BannerEnquiryRequest): Promise<BannerEnquiryResult> {
      return client.post('/api/banner-enquiries', payload)
    },
  }
}

export const bannerEnquiriesApi = makeBannerEnquiriesApi(apiClient)

/**
 * Admin Banner enquiry review API (Jira 9512). Authenticated via the admin proxy client. Read + a
 * simple "mark reviewed" action only — converting an enquiry into a priced order is a follow-up.
 */
export function makeAdminBannerEnquiriesApi(client: AdminApiClient) {
  return {
    list(params?: {
      status?: BannerQuoteRequestStatus
      skipCount?: number
      maxResultCount?: number
    }): Promise<PagedResult<BannerQuoteRequest>> {
      return client.get('/api/banner-enquiries', {
        status: params?.status,
        skipCount: params?.skipCount ?? 0,
        maxResultCount: params?.maxResultCount ?? 50,
      })
    },

    get(id: string): Promise<BannerQuoteRequest> {
      return client.get(`/api/banner-enquiries/${id}`)
    },

    markReviewed(id: string): Promise<BannerQuoteRequest> {
      return client.post(`/api/banner-enquiries/${id}/mark-reviewed`)
    },

    cancel(id: string): Promise<BannerQuoteRequest> {
      return client.post(`/api/banner-enquiries/${id}/cancel`)
    },

    convertToOrder(id: string, payload: ConvertBannerQuoteRequest): Promise<ConvertBannerQuoteRequestResult> {
      return client.post(`/api/banner-enquiries/${id}/convert-to-order`, payload)
    },
  }
}

export const adminBannerEnquiriesApi = makeAdminBannerEnquiriesApi(adminApiClient)
