import { apiClient, type ApiClient } from '@/lib/api-client'
import type { InventorySettings } from '@/types'

export function makeInventorySettingsApi(client: ApiClient) {
  return {
    get(): Promise<InventorySettings> {
      return client.get('/api/admin/inventory-settings')
    },

    update(input: InventorySettings): Promise<InventorySettings> {
      return client.put('/api/admin/inventory-settings', input)
    },
  }
}

export const inventorySettingsApi = makeInventorySettingsApi(apiClient)
