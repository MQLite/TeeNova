import { apiClient, type ApiClient } from '@/lib/api-client'
import type { DashboardStats } from '@/types'

export function makeDashboardApi(client: ApiClient) {
  return {
    getSummary(): Promise<DashboardStats> {
      return client.get('/api/admin/dashboard/summary')
    },
  }
}

export const dashboardApi = makeDashboardApi(apiClient)
