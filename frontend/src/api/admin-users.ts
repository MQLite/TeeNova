import type { AdminApiClient } from '@/lib/admin-client'
import type { AdminUser, CreateAdminUserInput, UpdateAdminUserInput } from '@/types'

export function makeAdminUsersApi(client: AdminApiClient) {
  return {
    list: (): Promise<AdminUser[]> =>
      client.get('/admin-users'),

    get: (id: string): Promise<AdminUser> =>
      client.get(`/admin-users/${id}`),

    create: (input: CreateAdminUserInput): Promise<AdminUser> =>
      client.post('/admin-users', input),

    update: (id: string, input: UpdateAdminUserInput): Promise<AdminUser> =>
      client.put(`/admin-users/${id}`, input),

    delete: (id: string): Promise<void> =>
      client.delete(`/admin-users/${id}`),
  }
}
