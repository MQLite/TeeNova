import { apiClient } from '@/lib/api-client'
import type {
  BatchPriceCalculationItem,
  BatchPriceCalculationResponse,
  PriceCalculationRequest,
  PriceCalculationResponse,
} from '@/types'

export const pricingApi = {
  calculatePricing(request: PriceCalculationRequest): Promise<PriceCalculationResponse> {
    return apiClient.post('/api/pricing/calculate', request)
  },

  calculateBatch(
    items: BatchPriceCalculationItem[],
    signal?: AbortSignal,
  ): Promise<BatchPriceCalculationResponse> {
    return apiClient.post('/api/pricing/calculate-batch', { items }, { signal })
  },
}
