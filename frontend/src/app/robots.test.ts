import { afterEach, describe, expect, it, vi } from 'vitest'
import { SITE_URL_ENV_VAR } from '@/lib/seo/site-url'
import robots from './robots'

/**
 * Jira 10308 — `/robots.txt`.
 */

const ORIGIN = 'https://www.example.com'

/** Production build with a valid origin — the only configuration that opens crawling. */
function productionEnv() {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv(SITE_URL_ENV_VAR, ORIGIN)
  vi.stubEnv('NEXT_PUBLIC_SEO_INDEXING_ENABLED', '')
}

const disallowList = (result: ReturnType<typeof robots>): string[] => {
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules]
  return rules.flatMap((rule) => {
    const value = rule?.disallow
    if (!value) return []
    return Array.isArray(value) ? value : [value]
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('production policy', () => {
  it('allows crawling and points at the absolute sitemap URL', () => {
    productionEnv()
    const result = robots()
    expect(result.sitemap).toBe(`${ORIGIN}/sitemap.xml`)
    expect(String(result.sitemap)).toMatch(/^https:\/\//)
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules
    expect(rules.allow).toBe('/')
    expect(rules.userAgent).toBe('*')
  })

  it('disallows only the operator and machine surfaces', () => {
    productionEnv()
    expect(disallowList(robots())).toEqual(['/admin/', '/api/'])
  })

  it('does not disallow any public content route', () => {
    productionEnv()
    const disallowed = disallowList(robots())
    for (const path of [
      '/',
      '/services',
      '/services/pvc-banners',
      '/products',
      '/products/11111111-1111-1111-1111-111111111111',
      '/portfolio',
      '/help/faq',
      '/contact',
      '/quote',
    ]) {
      expect(disallowed.some((rule) => path.startsWith(rule)), path).toBe(false)
    }
  })

  it('does not block stylesheets, scripts or images, which a crawler needs to render the page', () => {
    productionEnv()
    const disallowed = disallowList(robots())
    for (const asset of ['/_next/static/css/a.css', '/_next/static/chunks/b.js', '/uploads/products/c.png', '/icon.svg', '/opengraph-image.png']) {
      expect(disallowed.some((rule) => asset.startsWith(rule)), asset).toBe(false)
    }
  })

  /**
   * Deliberate: the transactional family is `noindex` in metadata instead. A disallowed URL is never
   * fetched, so its `noindex` is never read — and the cart is linked from the site header, so a
   * crawler that cannot fetch it can still index the bare URL.
   */
  it('leaves the transactional routes crawlable so their noindex is actually read', () => {
    productionEnv()
    const disallowed = disallowList(robots())
    for (const path of ['/cart', '/checkout', '/checkout/success', '/orders/abc', '/customize']) {
      expect(disallowed.some((rule) => path.startsWith(rule)), path).toBe(false)
    }
  })
})

describe('fail-closed policies', () => {
  it('disallows everything when no production origin is configured', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv(SITE_URL_ENV_VAR, '')
    const result = robots()
    expect(disallowList(result)).toEqual(['/'])
    expect(result.sitemap).toBeUndefined()
  })

  it('disallows everything outside a production build', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv(SITE_URL_ENV_VAR, ORIGIN)
    expect(disallowList(robots())).toEqual(['/'])
    expect(robots().sitemap).toBeUndefined()
  })

  it('honours an explicit indexing opt-out on a production-mode deployment', () => {
    productionEnv()
    vi.stubEnv('NEXT_PUBLIC_SEO_INDEXING_ENABLED', 'false')
    expect(disallowList(robots())).toEqual(['/'])
    // A staging host must never advertise a sitemap under the production origin.
    expect(robots().sitemap).toBeUndefined()
  })
})
