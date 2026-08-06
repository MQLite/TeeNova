import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PRINT_AREA_SIZES_TTL_MS,
  getCachedPrintAreaSizes,
  loadPrintAreaSizes,
  resetPrintAreaSizesCache,
} from './print-area-sizes-cache'
import type { PrintAreaSizeOption } from '@/types'

/**
 * Jira 10304 — selecting the same print area twice, or two areas at once, must not repeat the same
 * global request. Failures must stay uncached so deselect/reselect still retries.
 */

function options(areaId: string): PrintAreaSizeOption[] {
  return [
    {
      printAreaId: areaId,
      printSizeId: 'size-a4',
      printSize: { id: 'size-a4', name: 'A4' },
      isActive: true,
      sortOrder: 0,
    } as unknown as PrintAreaSizeOption,
  ]
}

beforeEach(() => {
  resetPrintAreaSizesCache()
})

describe('print area sizes cache', () => {
  it('serves a completed result without refetching', async () => {
    const fetcher = vi.fn(async (areaId: string) => options(areaId))

    await loadPrintAreaSizes('area-front', fetcher)
    const second = await loadPrintAreaSizes('area-front', fetcher)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(second).toEqual(options('area-front'))
    expect(getCachedPrintAreaSizes('area-front')).toEqual(options('area-front'))
  })

  it('deduplicates concurrent in-flight requests for the same area', async () => {
    let release: ((value: PrintAreaSizeOption[]) => void) | undefined
    const fetcher = vi.fn(
      () => new Promise<PrintAreaSizeOption[]>((resolve) => { release = resolve }),
    )

    const first = loadPrintAreaSizes('area-front', fetcher)
    const second = loadPrintAreaSizes('area-front', fetcher)

    expect(fetcher).toHaveBeenCalledTimes(1)

    release!(options('area-front'))
    await expect(first).resolves.toEqual(options('area-front'))
    await expect(second).resolves.toEqual(options('area-front'))
  })

  it('keeps separate entries per area', async () => {
    const fetcher = vi.fn(async (areaId: string) => options(areaId))

    await loadPrintAreaSizes('area-front', fetcher)
    await loadPrintAreaSizes('area-back', fetcher)

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(getCachedPrintAreaSizes('area-back')?.[0]?.printAreaId).toBe('area-back')
  })

  it('does not cache a failure, so a retry re-requests', async () => {
    const fetcher = vi
      .fn<(areaId: string) => Promise<PrintAreaSizeOption[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(options('area-front'))

    await expect(loadPrintAreaSizes('area-front', fetcher)).rejects.toThrow('offline')
    await expect(loadPrintAreaSizes('area-front', fetcher)).resolves.toEqual(options('area-front'))

    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('expires an entry after the TTL', async () => {
    const fetcher = vi.fn(async (areaId: string) => options(areaId))

    await loadPrintAreaSizes('area-front', fetcher)

    const later = Date.now() + PRINT_AREA_SIZES_TTL_MS + 1
    expect(getCachedPrintAreaSizes('area-front', later)).toBeUndefined()

    await loadPrintAreaSizes('area-front', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
