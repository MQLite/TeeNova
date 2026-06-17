import type { AdminApiClient } from '@/lib/admin-client'
import type { AdminUser, CreateAdminUserInput, UpdateAdminUserInput } from '@/types'

export function makeAdminUsersApi(client: AdminApiClient) {
  return {
    list: (): Promise<AdminUser[]> =>
      client.get('/api/admin-users'),

    get: (id: string): Promise<AdminUser> =>
      client.get(`/api/admin-users/${id}`),

    create: (input: CreateAdminUserInput): Promise<AdminUser> =>
      client.post('/api/admin-users', input),

    update: (id: string, input: UpdateAdminUserInput): Promise<AdminUser> =>
      client.put(`/api/admin-users/${id}`, input),

    delete: (id: string): Promise<void> =>
      client.delete(`/api/admin-users/${id}`),
  }
}
