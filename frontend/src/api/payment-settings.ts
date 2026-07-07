import { apiClient, type ApiClient } from '@/lib/api-client'
import type {
  PaymentProviderSetting,
  UpdateStripeTestSettings,
  StripeTestSettingsValidationResult,
} from '@/types'

// Admin persisted Stripe Test-mode settings API (Jira 9902).
// GET is Admin + Viewer (masked). PUT/disable/validate are Admin-only (enforced server-side).
export function makePaymentSettingsApi(client: ApiClient) {
  return {
    getStripe(): Promise<PaymentProviderSetting> {
      return client.get('/api/admin/payment-provider-settings')
    },

    updateStripeTest(input: UpdateStripeTestSettings): Promise<PaymentProviderSetting> {
      return client.put('/api/admin/payment-provider-settings/stripe-test', input)
    },

    disableStripeTest(): Promise<PaymentProviderSetting> {
      return client.post('/api/admin/payment-provider-settings/stripe-test/disable', {})
    },

    validateStripeTest(): Promise<StripeTestSettingsValidationResult> {
      return client.post('/api/admin/payment-provider-settings/stripe-test/validate', {})
    },
  }
}

export const paymentSettingsApi = makePaymentSettingsApi(apiClient)
