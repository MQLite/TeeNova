import { adminApiClient, type AdminApiClient } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'

export const ADMIN_LOG_SORT_FIELDS = [
  'fileName',
  'source',
  'sizeBytes',
  'lastModifiedUtc',
] as const

export const ADMIN_LOG_SORT_DIRECTIONS = ['asc', 'desc'] as const
export const ADMIN_LOG_PAGE_SIZES = [10, 25, 50, 100] as const

export type AdminLogSortField = (typeof ADMIN_LOG_SORT_FIELDS)[number]
export type AdminLogSortDirection = (typeof ADMIN_LOG_SORT_DIRECTIONS)[number]

export interface AdminLogFile {
  id: string
  fileName: string
  sourceKey: string
  sourceName: string
  sizeBytes: number
  lastModifiedUtc: string
  downloadable: boolean
  downloadBlockReason: string | null
}

export interface AdminLogSource {
  key: string
  displayName: string
  available: boolean
}

export interface AdminLogWarning {
  sourceKey: string
  code: string
  message: string
}

export interface AdminLogListResult {
  items: AdminLogFile[]
  sources: AdminLogSource[]
  warnings: AdminLogWarning[]
  page: number
  pageSize: number
  totalCount: number
  isTruncated: boolean
}

export interface AdminLogListInput {
  source?: string
  search?: string
  sortBy?: AdminLogSortField
  sortDirection?: AdminLogSortDirection
  page?: number
  pageSize?: (typeof ADMIN_LOG_PAGE_SIZES)[number]
}

export type AdminLogsErrorKind =
  | 'session-expired'
  | 'forbidden'
  | 'feature-disabled'
  | 'source-unavailable'
  | 'invalid-query'
  | 'failed'

export class AdminLogsClientError extends Error {
  constructor(
    public readonly kind: AdminLogsErrorKind,
    public readonly status: number,
  ) {
    super('The server log list could not be loaded.')
    this.name = 'AdminLogsClientError'
  }
}

export async function listAdminLogs(
  input: AdminLogListInput,
  client: AdminApiClient = adminApiClient,
  signal?: AbortSignal,
): Promise<AdminLogListResult> {
  const sortBy = ADMIN_LOG_SORT_FIELDS.includes(input.sortBy ?? 'lastModifiedUtc')
    ? input.sortBy ?? 'lastModifiedUtc'
    : 'lastModifiedUtc'
  const sortDirection = ADMIN_LOG_SORT_DIRECTIONS.includes(input.sortDirection ?? 'desc')
    ? input.sortDirection ?? 'desc'
    : 'desc'
  const pageSize = ADMIN_LOG_PAGE_SIZES.includes(input.pageSize ?? 25)
    ? input.pageSize ?? 25
    : 25
  const source = input.source?.trim()
  const search = input.search?.trim()

  try {
    return await client.get<AdminLogListResult>(
      '/api/admin/logs',
      {
        source: source || undefined,
        search: search || undefined,
        sortBy,
        sortDirection,
        page: Math.max(1, Math.trunc(input.page ?? 1)),
        pageSize,
      },
      signal,
    )
  } catch (error) {
    if (error instanceof AdminLogsClientError) throw error
    if (error instanceof ApiError) {
      throw classifyAdminLogsError(error)
    }
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new AdminLogsClientError('failed', 0)
  }
}

export function classifyAdminLogsError(error: ApiError): AdminLogsClientError {
  const code = (error.details as { error?: { code?: unknown } } | undefined)?.error?.code
  if (error.status === 401) return new AdminLogsClientError('session-expired', 401)
  if (error.status === 403) return new AdminLogsClientError('forbidden', 403)
  if (error.status === 400) return new AdminLogsClientError('invalid-query', 400)
  if (error.status === 503 && code === 'TeeNova:AdminLogs:Disabled') {
    return new AdminLogsClientError('feature-disabled', 503)
  }
  if (error.status === 503) return new AdminLogsClientError('source-unavailable', 503)
  return new AdminLogsClientError('failed', error.status)
}
