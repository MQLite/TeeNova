import { apiClient, type ApiClient } from '@/lib/api-client'
import type { EmailSettings } from '@/types'

export function makeEmailSettingsApi(client: ApiClient) {
  return {
    get(): Promise<EmailSettings> {
      return client.get('/api/admin/email-settings')
    },

    update(input: EmailSettings): Promise<EmailSettings> {
      return client.put('/api/admin/email-settings', input)
    },
  }
}

export const emailSettingsApi = makeEmailSettingsApi(apiClient)
