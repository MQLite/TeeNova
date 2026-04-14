import { apiClient } from '@/lib/api-client'
import type { DashboardStats } from '@/types'

export const dashboardApi = {
  getSummary(): Promise<DashboardStats> {
    return apiClient.get('/api/admin/dashboard/summary')
  },
}
