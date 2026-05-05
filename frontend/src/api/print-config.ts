import { apiClient } from '@/lib/api-client'
import type { PrintArea, PrintSize } from '@/types'

export const printConfigApi = {
  getAreas(): Promise<PrintArea[]> {
    return apiClient.get('/api/print-config/areas', { isActive: true })
  },

  getSizes(): Promise<PrintSize[]> {
    return apiClient.get('/api/print-config/sizes', { isActive: true })
  },
}
