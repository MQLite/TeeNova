import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  defaultDescription,
  defaultSocialImage,
  defaultTitle,
  titleTemplate,
  verificationTokens,
} from './identity'
import { NEVER_INDEXABLE_PREFIXES, ROUTE_POLICY, resolvePolicy, robotsDirective } from './indexability'
import { buildPageMetadata, canonicalUrl, metadataBase, transactionalMetadata } from './metadata'
import { DEVELOPMENT_FALLBACK_ORIGIN, SITE_URL_ENV_VAR } from './site-url'

/**
 * Jira 10308 — metadata construction.
 */

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('site identity', () => {
  it('templates route titles with the configured brand and invents no slogan', () => {
    expect(titleTemplate).toBe('%s | Otahuhu Printing')
    expect(defaultTitle).toBe('Otahuhu Printing Shop | Custom Printing Auckland')
    // No superlative, speed or coverage claim in the site-wide description.
    expect(defaultDescription).not.toMatch(
      /best|cheapest|fastest|same[- ]day|top[- ]rated|leading|premium|nationwide|guarantee/i,
    )
  })

  it('emits no legal name and no verification token by default', () => {
    expect(defaultTitle).not.toMatch(/Quality Canvas/i)
    expect(defaultDescription).not.toMatch(/Quality Canvas/i)
    expect(verificationTokens()).toEqual({})
  })

  it('emits a verification token only when a real one is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION', 'a-real-token')
    expect(verificationTokens()).toEqual({ google: 'a-real-token' })
  })
})

describe('metadataBase', () => {
  it('is the site origin outside production', () => {
    expect(metadataBase()?.toString()).toBe(`${DEVELOPMENT_FALLBACK_ORIGIN}/`)
  })

  it('is undefined in production when no origin is configured, rather than a guess', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv(SITE_URL_ENV_VAR, '')
    expect(metadataBase()).toBeUndefined()
  })
})

describe('canonical URLs', () => {
  it('is absolute for an indexable route', () => {
    vi.stubEnv(SITE_URL_ENV_VAR, 'https://www.example.com')
    expect(canonicalUrl('/services/pvc-banners')).toBe('https://www.example.com/services/pvc-banners')
  })

  it('drops the query string so filter and source variants share one canonical', () => {
    vi.stubEnv(SITE_URL_ENV_VAR, 'https://www.example.com')
    const bare = buildPageMetadata({
      title: 'Products',
      description: 'd',
      path: '/products',
      policy: 'index',
    })
    const filtered = buildPageMetadata({
      title: 'Badges',
      description: 'd2',
      path: '/products?category=badges&search=tee',
      policy: 'index',
    })
    expect(filtered.alternates?.canonical).toBe(bare.alternates?.canonical)
    expect(String(filtered.alternates?.canonical)).toBe('https://www.example.com/products')
  })

  it('is omitted entirely in production when the origin is unavailable', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv(SITE_URL_ENV_VAR, '')
    const metadata = buildPageMetadata({
      title: 'Contact',
      description: 'd',
      path: '/contact',
      policy: 'index',
    })
    expect(metadata.alternates).toBeUndefined()
    expect(metadata.openGraph).not.toHaveProperty('url')
  })

  it('never produces a localhost canonical in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv(SITE_URL_ENV_VAR, 'https://localhost:3000')
    expect(canonicalUrl('/')).toBeNull()
  })
})

describe('buildPageMetadata', () => {
  it('produces Open Graph and Twitter blocks with no unverified handle', () => {
    vi.stubEnv(SITE_URL_ENV_VAR, 'https://www.example.com')
    const metadata = buildPageMetadata({
      title: 'Printing Services',
      description: 'What we print.',
      path: '/services',
      policy: 'index',
    })
    expect(metadata.openGraph?.title).toBe('Printing Services | Otahuhu Printing')
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      locale: 'en_NZ',
      siteName: 'Otahuhu Printing Shop',
      url: 'https://www.example.com/services',
    })
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' })
    expect(metadata.twitter).not.toHaveProperty('site')
    expect(metadata.twitter).not.toHaveProperty('creator')
  })

  it('attaches the default social card, with alt text and platform dimensions', () => {
    vi.stubEnv(SITE_URL_ENV_VAR, 'https://www.example.com')
    const metadata = buildPageMetadata({
      title: 'x',
      description: 'y',
      path: '/x',
      policy: 'index',
    })
    expect(metadata.openGraph?.images).toEqual([
      {
        url: 'https://www.example.com/og-default.png',
        alt: 'Otahuhu Printing Shop — custom printing in Otahuhu, Auckland',
        width: 1200,
        height: 630,
      },
    ])
    expect(metadata.twitter?.images).toEqual(metadata.openGraph?.images)
  })

  it('names no unapproved logo, legal name or slogan on the default card', () => {
    // The card is `public/og-default.png`, not the app icon or the favicon, and its alt text is the
    // brand name plus the location — no positioning line and no registered entity.
    expect(defaultSocialImage.url).toBe('/og-default.png')
    expect(defaultSocialImage.url).not.toMatch(/icon|favicon|logo/i)
    expect(defaultSocialImage.alt).not.toMatch(/Quality Canvas|best|fastest|guaranteed/i)
    expect(defaultSocialImage.alt.trim()).toBe(defaultSocialImage.alt)
  })

  it('is byte-identical on every call — the card is an asset, not a render', () => {
    const first = buildPageMetadata({ title: 'x', description: 'y', path: '/x', policy: 'index' })
    const second = buildPageMetadata({ title: 'x', description: 'y', path: '/x', policy: 'index' })
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('resolves a relative page image to an absolute URL and keeps its alt text', () => {
    vi.stubEnv(SITE_URL_ENV_VAR, 'https://www.example.com')
    const metadata = buildPageMetadata({
      title: 'x',
      description: 'y',
      path: '/x',
      policy: 'index',
      images: [{ url: '/uploads/products/a.png', alt: 'A tee' }],
    })
    expect(metadata.openGraph?.images).toEqual([
      { url: 'https://www.example.com/uploads/products/a.png', alt: 'A tee' },
    ])
  })

  it('emits no image at all rather than a relative one when the origin is unavailable', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv(SITE_URL_ENV_VAR, '')
    const metadata = buildPageMetadata({
      title: 'x',
      description: 'y',
      path: '/x',
      policy: 'index',
      images: [{ url: '/uploads/products/a.png', alt: 'A tee' }],
    })
    // A relative og:image resolves against whichever host answered — the same failure the canonical
    // rules exist to prevent — so the default card is suppressed too.
    expect(metadata.openGraph).not.toHaveProperty('images')
    expect(metadata.twitter).not.toHaveProperty('images')
  })

  it('uses the title verbatim only when asked', () => {
    expect(buildPageMetadata({ title: 'T', description: 'd', path: '/', policy: 'index' }).title).toBe('T')
    expect(
      buildPageMetadata({
        title: 'T',
        description: 'd',
        path: '/',
        policy: 'index',
        absoluteTitle: true,
      }).title,
    ).toEqual({ absolute: 'T' })
  })
})

describe('robots directives', () => {
  it('maps each policy to the expected pair', () => {
    expect(robotsDirective('index')).toEqual({ index: true, follow: true })
    expect(robotsDirective('noindex-follow')).toEqual({ index: false, follow: true })
    expect(robotsDirective('noindex-nofollow')).toEqual({ index: false, follow: false })
  })

  it('gives a transactional route no canonical and no social card', () => {
    const metadata = transactionalMetadata('Your Cart', 'Review your cart.')
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.alternates).toBeUndefined()
    expect(metadata.openGraph).toBeUndefined()
  })
})

describe('route indexing policy', () => {
  it('never marks an authenticated, transactional or API route indexable', () => {
    for (const entry of ROUTE_POLICY) {
      if (!NEVER_INDEXABLE_PREFIXES.some((prefix) => entry.route.startsWith(prefix))) continue
      expect(resolvePolicy(entry, true), entry.route).toBe('noindex-nofollow')
      expect(entry.sitemap, entry.route).toBe(false)
    }
  })

  it('excludes the redirect-only and error routes from the sitemap', () => {
    for (const route of ['/customize', '(404)', '/products/[id] (not found)']) {
      const entry = ROUTE_POLICY.find((candidate) => candidate.route === route)
      expect(entry, route).toBeDefined()
      expect(entry!.sitemap, route).toBe(false)
      expect(resolvePolicy(entry!), route).toBe('noindex-nofollow')
    }
  })

  it('drops the feature-flag routes out of the index when their feature is off', () => {
    for (const route of ['/quote', '/portfolio']) {
      const entry = ROUTE_POLICY.find((candidate) => candidate.route === route)!
      expect(resolvePolicy(entry, true), route).toBe('index')
      expect(resolvePolicy(entry, false), route).toBe('noindex-follow')
    }
  })

  it('covers every public route family exactly once', () => {
    const routes = ROUTE_POLICY.map((entry) => entry.route)
    expect(new Set(routes).size).toBe(routes.length)
    for (const route of ['/', '/services', '/products', '/contact', '/help/[slug]', '/quote']) {
      expect(routes).toContain(route)
    }
  })
})
