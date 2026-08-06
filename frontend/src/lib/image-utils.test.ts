import { describe, expect, it } from 'vitest'
import { isOptimizableImageUrl, resolveImageUrl } from './image-utils'

/**
 * Jira 10304 — `next/image` throws for any URL outside `images.remotePatterns`, so the runtime guard
 * must admit exactly the catalogue image origin/path the build allows and nothing else. In tests
 * NEXT_PUBLIC_API_BASE_URL is unset, so the client falls back to https://localhost:44300.
 */

const CATALOG_IMAGE = 'https://localhost:44300/uploads/products/tee.png'

describe('isOptimizableImageUrl', () => {
  it('admits a catalogue image on the configured API origin', () => {
    expect(isOptimizableImageUrl(CATALOG_IMAGE)).toBe(true)
    expect(isOptimizableImageUrl(resolveImageUrl('/uploads/products/tee.png'))).toBe(true)
  })

  it('rejects a third-party host', () => {
    expect(isOptimizableImageUrl('https://images.example.com/uploads/products/tee.png')).toBe(false)
  })

  it('rejects a different port or scheme on the same hostname', () => {
    expect(isOptimizableImageUrl('https://localhost:3000/uploads/products/tee.png')).toBe(false)
    expect(isOptimizableImageUrl('http://localhost:44300/uploads/products/tee.png')).toBe(false)
  })

  it('never routes customer design artwork through the public optimizer', () => {
    expect(isOptimizableImageUrl('https://localhost:44300/uploads/designs/secret.png')).toBe(false)
  })

  it('rejects empty, relative and unparseable values', () => {
    expect(isOptimizableImageUrl(null)).toBe(false)
    expect(isOptimizableImageUrl(undefined)).toBe(false)
    expect(isOptimizableImageUrl('')).toBe(false)
    expect(isOptimizableImageUrl('/uploads/products/tee.png')).toBe(false)
    expect(isOptimizableImageUrl('not a url')).toBe(false)
  })
})
