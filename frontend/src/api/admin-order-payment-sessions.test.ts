import { describe, expect, it, vi } from 'vitest'
import { makeOrdersApi } from './orders'
import type { ApiClient } from '@/lib/api-client'

describe('admin order payment-session API', () => {
  it('uses only the dedicated admin read endpoint', async () => {
    const get = vi.fn().mockResolvedValue([])
    const api = makeOrdersApi({ get } as unknown as ApiClient)

    await api.getAdminOnlinePaymentSessions('order-id')

    expect(get).toHaveBeenCalledWith('/api/admin/orders/order-id/online-payment-sessions')
  })
})
