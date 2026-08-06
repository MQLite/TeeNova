import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEVELOPMENT_FALLBACK_ORIGIN,
  SITE_URL_ENV_VAR,
  absoluteUrl,
  joinOrigin,
  normalizeSiteOrigin,
  resolveSiteOrigin,
  siteOrigin,
  siteOriginReadiness,
} from './site-url'

/**
 * Jira 10308 — the public site origin.
 *
 * These are the rules that stop the site publishing a canonical URL it cannot stand behind: a
 * localhost address in production, an origin taken from the backend, a value carrying credentials
 * or a query string, or a guessed domain when none is configured.
 */

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('normalizeSiteOrigin', () => {
  it('accepts an https origin and strips the trailing slash', () => {
    expect(normalizeSiteOrigin('https://www.example.com/')).toEqual({
      origin: 'https://www.example.com',
    })
    expect(normalizeSiteOrigin('  https://www.example.com  ')).toEqual({
      origin: 'https://www.example.com',
    })
  })

  it('keeps a non-default port and drops the default one', () => {
    expect(normalizeSiteOrigin('https://example.com:8443').origin).toBe('https://example.com:8443')
    expect(normalizeSiteOrigin('https://example.com:443').origin).toBe('https://example.com')
  })

  it('rejects a relative path', () => {
    expect(normalizeSiteOrigin('/')).toEqual({ origin: null, failure: 'relative' })
    expect(normalizeSiteOrigin('/shop')).toEqual({ origin: null, failure: 'relative' })
  })

  it('rejects a non-http protocol', () => {
    expect(normalizeSiteOrigin('javascript:alert(1)')).toEqual({
      origin: null,
      failure: 'unsupported-protocol',
    })
    expect(normalizeSiteOrigin('data:text/html,x').failure).toBe('unsupported-protocol')
    expect(normalizeSiteOrigin('file:///etc/hosts').failure).toBe('unsupported-protocol')
  })

  it('rejects credentials in the URL', () => {
    expect(normalizeSiteOrigin('https://user:pass@example.com')).toEqual({
      origin: null,
      failure: 'credentials',
    })
    expect(normalizeSiteOrigin('https://user@example.com').failure).toBe('credentials')
  })

  it('rejects a query string, a fragment or a path prefix', () => {
    expect(normalizeSiteOrigin('https://example.com?utm_source=x').failure).toBe('query')
    expect(normalizeSiteOrigin('https://example.com#top').failure).toBe('fragment')
    expect(normalizeSiteOrigin('https://example.com/shop').failure).toBe('path')
  })

  it('rejects an unparseable value and an empty one', () => {
    expect(normalizeSiteOrigin('not a url').failure).toBe('unparseable')
    expect(normalizeSiteOrigin('')).toEqual({ origin: null, failure: 'missing' })
    expect(normalizeSiteOrigin(undefined)).toEqual({ origin: null, failure: 'missing' })
  })

  it('rejects plain http unless it is an explicitly allowed local address', () => {
    expect(normalizeSiteOrigin('http://example.com').failure).toBe('insecure-protocol')
    expect(normalizeSiteOrigin('http://localhost:3000').failure).toBe('insecure-protocol')
    expect(
      normalizeSiteOrigin('http://localhost:3000', { allowInsecureLocalhost: true }).origin,
    ).toBe('http://localhost:3000')
  })

  it('rejects a local hostname when local origins are disallowed', () => {
    for (const value of ['https://localhost', 'https://127.0.0.1', 'https://app.localhost']) {
      expect(normalizeSiteOrigin(value, { allowLocalhost: false }).failure).toBe(
        'localhost-in-production',
      )
    }
  })
})

describe('resolveSiteOrigin outside production', () => {
  it('falls back to the documented development origin when nothing is configured', () => {
    vi.stubEnv(SITE_URL_ENV_VAR, '')
    const resolved = resolveSiteOrigin()
    expect(resolved.origin).toBe(DEVELOPMENT_FALLBACK_ORIGIN)
    expect(resolved.source).toBe('development-fallback')
  })

  it('prefers a configured origin over the fallback', () => {
    vi.stubEnv(SITE_URL_ENV_VAR, 'https://staging.example.com')
    expect(siteOrigin()).toBe('https://staging.example.com')
  })
})

describe('resolveSiteOrigin in production', () => {
  it('uses a valid https origin', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv(SITE_URL_ENV_VAR, 'https://www.example.com')
    const resolved = resolveSiteOrigin()
    expect(resolved.origin).toBe('https://www.example.com')
    expect(resolved.source).toBe('configured')
  })

  it('fails closed rather than falling back to localhost when the value is missing', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv(SITE_URL_ENV_VAR, '')
    const resolved = resolveSiteOrigin()
    expect(resolved.origin).toBeNull()
    expect(resolved.source).toBe('unavailable')
    expect(siteOriginReadiness().ready).toBe(false)
  })

  it('refuses a localhost origin even when one is explicitly configured', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv(SITE_URL_ENV_VAR, 'https://localhost:3000')
    expect(siteOrigin()).toBeNull()
    expect(resolveSiteOrigin().failure).toBe('localhost-in-production')
  })

  it('refuses plain http', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv(SITE_URL_ENV_VAR, 'http://www.example.com')
    expect(siteOrigin()).toBeNull()
  })

  it('never adopts the backend address as the website origin', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv(SITE_URL_ENV_VAR, '')
    // Both are set to plausible values; neither may be used as a canonical authority.
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.example.com')
    vi.stubEnv('BACKEND_URL', 'http://localhost:5100')
    expect(siteOrigin()).toBeNull()
    expect(absoluteUrl('/services')).toBeNull()
  })
})

describe('absoluteUrl', () => {
  it('resolves a path against the origin without a trailing slash', () => {
    vi.stubEnv(SITE_URL_ENV_VAR, 'https://www.example.com')
    expect(absoluteUrl('/services')).toBe('https://www.example.com/services')
    expect(absoluteUrl('/services/')).toBe('https://www.example.com/services')
    expect(absoluteUrl('/')).toBe('https://www.example.com/')
  })

  it('strips query strings and fragments', () => {
    vi.stubEnv(SITE_URL_ENV_VAR, 'https://www.example.com')
    expect(absoluteUrl('/products?search=tee&category=badges')).toBe(
      'https://www.example.com/products',
    )
    expect(absoluteUrl('/quote?service=signage&source=/services/signage')).toBe(
      'https://www.example.com/quote',
    )
    expect(absoluteUrl('/help/faq#how-is-price-calculated')).toBe(
      'https://www.example.com/help/faq',
    )
  })

  it('produces no duplicate trailing-slash form', () => {
    expect(joinOrigin('https://x.test', '/a/b//')).toBe('https://x.test/a/b')
  })
})

describe('readiness reporting', () => {
  it('names the variable and the reason, and leaks nothing else', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv(SITE_URL_ENV_VAR, 'https://user:secret@example.com')
    const { ready, message } = siteOriginReadiness()
    expect(ready).toBe(false)
    expect(message).toContain(SITE_URL_ENV_VAR)
    expect(message).toContain('credentials')
    expect(message).not.toContain('secret')
  })
})
