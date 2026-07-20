import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-client'
import type { AdminApiClient } from '@/lib/admin-client'
import {
  AdminLogsClientError,
  classifyAdminLogsError,
  listAdminLogs,
  type AdminLogListResult,
} from './admin-logs'

const emptyResult: AdminLogListResult = {
  items: [],
  sources: [],
  warnings: [],
  page: 1,
  pageSize: 25,
  totalCount: 0,
  isTruncated: false,
}

afterEach(() => vi.unstubAllGlobals())

describe('listAdminLogs', () => {
  it('uses the existing listing proxy, safely encodes filters, and omits empty optionals', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(emptyResult))
    vi.stubGlobal('fetch', fetchMock)

    await listAdminLogs({ source: ' ', search: 'api & worker.log', page: 1 })

    const requested = String(fetchMock.mock.calls[0][0])
    expect(requested).toContain('/api/proxy/api/admin/logs?')
    expect(requested).toContain('search=api+%26+worker.log')
    expect(requested).not.toContain('source=')
    expect(requested).toContain('sortBy=lastModifiedUtc')
    expect(requested).toContain('sortDirection=desc')
  })

  it('restricts sort, page, and page size to fixed safe values', async () => {
    const get = vi.fn().mockResolvedValue(emptyResult)
    const client = { get } as unknown as AdminApiClient

    await listAdminLogs({
      sortBy: 'physicalPath' as never,
      sortDirection: 'sideways' as never,
      page: -2,
      pageSize: 999 as never,
    }, client)

    expect(get).toHaveBeenCalledWith('/api/admin/logs', {
      source: undefined,
      search: undefined,
      sortBy: 'lastModifiedUtc',
      sortDirection: 'desc',
      page: 1,
      pageSize: 25,
    }, undefined)
  })

  it.each([
    [401, undefined, 'session-expired'],
    [403, undefined, 'forbidden'],
    [400, undefined, 'invalid-query'],
    [503, 'TeeNova:AdminLogs:Disabled', 'feature-disabled'],
    [503, 'TeeNova:AdminLogs:SourceUnavailable', 'source-unavailable'],
    [500, undefined, 'failed'],
  ])('classifies status %s without exposing raw backend messages', (status, code, kind) => {
    const error = new ApiError(status, 'raw backend detail', code ? { error: { code, message: 'raw' } } : undefined)
    const classified = classifyAdminLogsError(error)
    expect(classified).toBeInstanceOf(AdminLogsClientError)
    expect(classified.kind).toBe(kind)
    expect(classified.message).not.toContain('raw')
  })
})
