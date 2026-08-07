import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: { get } }))
vi.mock('@/lib/admin-client', () => ({ adminApiClient: {} }))

import { portfolioApi } from './portfolio'

describe('portfolio cache invalidation contract', () => {
  beforeEach(() => get.mockReset())

  it('tags public list and detail reads for moderation invalidation', async () => {
    get.mockResolvedValue({ totalCount: 0, items: [] })
    await portfolioApi.list()
    await portfolioApi.get('approved-work')

    expect(get.mock.calls[0][2]).toEqual({ revalidate: 300, tags: ['portfolio'] })
    expect(get.mock.calls[1][2]).toEqual({ revalidate: 300, tags: ['portfolio'] })
  })

  it('immediately expires the tag after successful Admin portfolio mutations', () => {
    const source = readFileSync(
      join(process.cwd(), 'src', 'app', 'api', 'proxy', '[...path]', 'route.ts'),
      'utf8',
    )
    expect(source).toContain("backendPath.startsWith('/api/portfolio/admin/items')")
    expect(source).toContain('backendRes.ok && hasBody')
    expect(source).toContain('revalidateTag(PORTFOLIO_CACHE_TAG, { expire: 0 })')
  })
})
