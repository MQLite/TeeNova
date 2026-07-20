import { describe, expect, it } from 'vitest'
import { fileSizeLabel } from './file-utils'
import { formatNzDateTime, parseBackendDate } from './datetime'

describe('fileSizeLabel', () => {
  it.each([
    [0, '0 B'],
    [842, '842 B'],
    [1024, '1 KB'],
    [15_000, '14.6 KB'],
    [2_831_155, '2.7 MB'],
    [1_288_490_189, '1.2 GB'],
  ])('formats %s bytes as %s', (bytes, expected) => {
    expect(fileSizeLabel(bytes)).toBe(expected)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])('fails safely for %s', value => {
    expect(fileSizeLabel(value)).toBe('—')
  })
})

describe('backend date formatting', () => {
  it('treats a timezone-less backend value as UTC and formats in Pacific/Auckland', () => {
    expect(parseBackendDate('2026-07-20T02:00:00')?.toISOString()).toBe('2026-07-20T02:00:00.000Z')
    expect(formatNzDateTime('2026-07-20T02:00:00Z')).toMatch(/20 Jul 2026/)
  })

  it('handles invalid values safely', () => {
    expect(parseBackendDate('not-a-date')).toBeNull()
    expect(formatNzDateTime('not-a-date')).toBe('—')
  })
})
