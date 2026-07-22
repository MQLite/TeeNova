import { apiClient, type ApiClient } from '@/lib/api-client'
import type {
  PaymentProviderSetting,
  PaymentSettingsOverview,
  UpdateStripeTestSettings,
  UpdateStripeLiveSettings,
  StripeTestSettingsValidationResult,
} from '@/types'

// Admin persisted Stripe settings API (Jira 9902; Live-mode guard 9908).
// GET is Admin + Viewer (masked). PUT/disable/validate are Admin-only (enforced server-side).
// Live writes are additionally rejected server-side unless the unlock flag is set.
export function makePaymentSettingsApi(client: ApiClient) {
  return {
    getStripe(): Promise<PaymentProviderSetting> {
      return client.get('/api/admin/payment-provider-settings')
    },

    getOverview(): Promise<PaymentSettingsOverview> {
      return client.get('/api/admin/payment-provider-settings/overview')
    },

    updateStripeTest(input: UpdateStripeTestSettings): Promise<PaymentProviderSetting> {
      return client.put('/api/admin/payment-provider-settings/stripe-test', input)
    },

    updateStripeLive(input: UpdateStripeLiveSettings): Promise<PaymentProviderSetting> {
      return client.put('/api/admin/payment-provider-settings/stripe-live', input)
    },

    disableStripeTest(): Promise<PaymentProviderSetting> {
      return client.post('/api/admin/payment-provider-settings/stripe-test/disable', {})
    },

    disableStripeLive(): Promise<PaymentProviderSetting> {
      return client.post('/api/admin/payment-provider-settings/stripe-live/disable', {})
    },

    validateStripeTest(): Promise<StripeTestSettingsValidationResult> {
      return client.post('/api/admin/payment-provider-settings/stripe-test/validate', {})
    },
  }
}

export const paymentSettingsApi = makePaymentSettingsApi(apiClient)
