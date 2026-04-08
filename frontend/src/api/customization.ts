import { apiClient } from '@/lib/api-client'
import type { PrintPositionOption } from '@/types'

export const customizationApi = {
  getPrintPositions(): Promise<PrintPositionOption[]> {
    return apiClient.get('/api/customization/print-positions')
  },
}
