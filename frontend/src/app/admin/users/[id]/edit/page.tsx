import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { makeAdminApiClient } from '@/lib/auth'
import { EditUserForm } from './EditUserForm'
import type { AdminUser } from '@/types'

export const metadata: Metadata = { title: 'Edit User' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditUserPage({ params }: Props) {
  const { id } = await params

  let user: AdminUser | null = null
  try {
    const client = makeAdminApiClient()
    user = await client.get<AdminUser>(`/api/admin-users/${id}`)
  } catch {
    notFound()
  }

  if (!user) notFound()

  return <EditUserForm user={user} />
}
