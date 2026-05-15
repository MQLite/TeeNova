import { apiClient } from '@/lib/api-client'
import type { EmailSettings } from '@/types'

export const emailSettingsApi = {
  get(): Promise<EmailSettings> {
    return apiClient.get('/api/admin/email-settings')
  },

  update(input: EmailSettings): Promise<EmailSettings> {
    return apiClient.put('/api/admin/email-settings', input)
  },
}
