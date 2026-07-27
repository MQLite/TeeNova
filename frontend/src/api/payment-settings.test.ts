import { describe, expect, it, vi } from 'vitest'
import { makePaymentSettingsApi } from './payment-settings'
import type { ApiClient } from '@/lib/api-client'

const surcharge = {
  surchargeEnabled: true,
  surchargePercentageBasisPoints: 265,
  surchargeFixedAmount: 0.3,
  surchargeDisclosureText: 'Disclosure',
  surchargeCalculationVersion: 'stripe-gross-up-v1',
}

describe('payment settings API request shape', () => {
  it.each([
    ['Test', 'updateStripeTest', '/api/admin/payment-provider-settings/stripe-test', {}],
    ['Live', 'updateStripeLive', '/api/admin/payment-provider-settings/stripe-live', { confirmationPhrase: 'ENABLE LIVE MODE' }],
  ] as const)('passes all five surcharge fields to the %s endpoint', async (_, method, path, extra) => {
    const put = vi.fn().mockResolvedValue({})
    const api = makePaymentSettingsApi({ put } as unknown as ApiClient)
    const input = { isEnabled: true, currency: 'NZD', ...extra, ...surcharge }
    if (method === 'updateStripeLive') {
      await api.updateStripeLive({ ...input, confirmationPhrase: 'ENABLE LIVE MODE' })
    } else {
      await api.updateStripeTest(input)
    }
    expect(put).toHaveBeenCalledWith(path, expect.objectContaining(surcharge))
    expect(Object.keys(put.mock.calls[0][1]).filter((key) => key.startsWith('surcharge'))).toHaveLength(5)
  })
})
