import { apiClient } from '@/lib/api-client'
import type { PriceCalculationRequest, PriceCalculationResponse } from '@/types'

export const pricingApi = {
  calculatePricing(request: PriceCalculationRequest): Promise<PriceCalculationResponse> {
    return apiClient.post('/api/pricing/calculate', request)
  },
}
