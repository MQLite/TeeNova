import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SITE_URL_ENV_VAR } from '@/lib/seo/site-url'
import { publishedServices } from '@/lib/service-content/registry'
import { publishedDocuments } from '@/lib/public-content/registry'
import type { PortfolioItem } from '@/api/portfolio'
import type { ProductListItem } from '@/types'

/**
 * Jira 10308 — `/sitemap.xml`.
 *
 * The catalogue and portfolio reads are mocked here. What is being tested is the sitemap's own
 * rules: which routes it lists, which it must never list, that a backend failure costs only the
 * dynamic entries, and that it never stamps a fabricated modification date.
 */

const ORIGIN = 'https://www.example.com'

const getProducts = vi.fn()
const listPage = vi.fn()

vi.mock('@/api/catalog', () => ({ catalogApi: { getProducts: (...args: unknown[]) => getProducts(...args) } }))
vi.mock('@/api/portfolio', () => ({
  portfolioApi: { listPage: (...args: unknown[]) => listPage(...args) },
  get portfolioEnabled() {
    return process.env.NEXT_PUBLIC_PORTFOLIO_ENABLED === 'true'
  },
}))

const productListItem = (id: string, isActive = true): ProductListItem =>
  ({
    id,
    name: `Product ${id}`,
    basePrice: 10,
    productType: 'tshirt',
    kind: 'Garment',
    pricingModel: 'GarmentPrint',
    minimumQuantity: 1,
    isActive,
    thumbnailUrl: null,
    primaryImageUrl: null,
    variantCount: 0,
    fromPrice: null,
    hasPriceTiers: false,
    hero: null,
  }) as ProductListItem

const portfolioItem = (slug: string, overrides: Partial<PortfolioItem> = {}): PortfolioItem =>
  ({
    id: slug,
    title: slug,
    slug,
    serviceType: 'GarmentPrinting',
    shortCaption: 'caption',
    status: 'Published',
    sortOrder: 0,
    isFeatured: false,
    publishedAt: '2026-07-01T00:00:00Z',
    images: [],
    ...overrides,
  }) as PortfolioItem

/** Re-import so the feature-flag module constants pick up the stubbed environment. */
async function loadSitemap() {
  vi.resetModules()
  return (await import('./sitemap')).default
}

beforeEach(() => {
  vi.stubEnv(SITE_URL_ENV_VAR, ORIGIN)
  vi.stubEnv('NEXT_PUBLIC_PORTFOLIO_ENABLED', 'false')
  vi.stubEnv('NEXT_PUBLIC_QUOTE_FORM_ENABLED', 'false')
  getProducts.mockResolvedValue({ totalCount: 0, items: [] })
  listPage.mockResolvedValue({ totalCount: 0, items: [] })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('static entries', () => {
  it('lists the permanent public routes with absolute URLs', async () => {
    const sitemap = await loadSitemap()
    const urls = (await sitemap()).map((entry) => entry.url)
    expect(urls).toContain(`${ORIGIN}/`)
    expect(urls).toContain(`${ORIGIN}/services`)
    expect(urls).toContain(`${ORIGIN}/products`)
    expect(urls).toContain(`${ORIGIN}/contact`)
    for (const url of urls) expect(url).toMatch(/^https:\/\/www\.example\.com/)
  })

  it('lists every published service and published help document, and no draft one', async () => {
    const sitemap = await loadSitemap()
    const urls = (await sitemap()).map((entry) => entry.url)

    for (const service of publishedServices()) {
      expect(urls).toContain(`${ORIGIN}/services/${service.slug}`)
    }
    for (const document of publishedDocuments()) {
      expect(urls).toContain(`${ORIGIN}/${document.group}/${document.slug}`)
    }

    // Every policy is Draft today, and four help documents are too; none may appear.
    for (const slug of ['privacy', 'returns', 'payment-terms', 'terms']) {
      expect(urls).not.toContain(`${ORIGIN}/policies/${slug}`)
    }
    for (const slug of ['turnaround', 'delivery-and-pickup', 'size-guide', 'garment-care']) {
      expect(urls).not.toContain(`${ORIGIN}/help/${slug}`)
    }
  })

  it('carries a real review date as lastModified and never a build timestamp', async () => {
    const sitemap = await loadSitemap()
    const entries = await sitemap()
    const service = publishedServices()[0]
    const entry = entries.find((candidate) => candidate.url.endsWith(`/services/${service.slug}`))!
    expect(entry.lastModified).toEqual(new Date(`${service.lastReviewedAt}T00:00:00Z`))

    // The homepage and the products index have no recorded modification date, so they carry none.
    expect(entries.find((candidate) => candidate.url === `${ORIGIN}/`)!.lastModified).toBeUndefined()
    expect(
      entries.find((candidate) => candidate.url === `${ORIGIN}/products`)!.lastModified,
    ).toBeUndefined()
  })

  it('omits changeFrequency and priority rather than inventing values', async () => {
    const sitemap = await loadSitemap()
    for (const entry of await sitemap()) {
      expect(entry.changeFrequency).toBeUndefined()
      expect(entry.priority).toBeUndefined()
    }
  })
})

describe('excluded routes', () => {
  it('lists no admin, API, cart, checkout, order, redirect or error URL', async () => {
    getProducts.mockResolvedValue({ totalCount: 1, items: [productListItem('p1')] })
    const sitemap = await loadSitemap()
    const urls = (await sitemap()).map((entry) => entry.url)
    for (const path of [
      '/admin',
      '/api',
      '/cart',
      '/checkout',
      '/checkout/success',
      '/checkout/cancel',
      '/orders',
      '/customize',
      '/404',
      '/_not-found',
    ]) {
      expect(urls.some((url) => url.includes(path)), path).toBe(false)
    }
  })

  it('lists no query-string variant', async () => {
    const sitemap = await loadSitemap()
    for (const entry of await sitemap()) {
      expect(entry.url).not.toContain('?')
      expect(entry.url).not.toContain('#')
    }
  })

  it('omits the feature-flagged routes while their features are off', async () => {
    const sitemap = await loadSitemap()
    const urls = (await sitemap()).map((entry) => entry.url)
    expect(urls).not.toContain(`${ORIGIN}/quote`)
    expect(urls).not.toContain(`${ORIGIN}/portfolio`)
  })

  it('includes them once the features are on', async () => {
    vi.stubEnv('NEXT_PUBLIC_QUOTE_FORM_ENABLED', 'true')
    vi.stubEnv('NEXT_PUBLIC_PORTFOLIO_ENABLED', 'true')
    const sitemap = await loadSitemap()
    const urls = (await sitemap()).map((entry) => entry.url)
    expect(urls).toContain(`${ORIGIN}/quote`)
    expect(urls).toContain(`${ORIGIN}/portfolio`)
  })
})

describe('product entries', () => {
  it('lists active products by GUID and nothing else about them', async () => {
    getProducts.mockResolvedValue({
      totalCount: 2,
      items: [productListItem('11111111-1111-1111-1111-111111111111'), productListItem('22222222-2222-2222-2222-222222222222')],
    })
    const sitemap = await loadSitemap()
    const entries = await sitemap()
    expect(entries.map((entry) => entry.url)).toEqual(
      expect.arrayContaining([
        `${ORIGIN}/products/11111111-1111-1111-1111-111111111111`,
        `${ORIGIN}/products/22222222-2222-2222-2222-222222222222`,
      ]),
    )
    // No name, description or image leaks into the XML, and no fabricated date.
    const product = entries.find((entry) => entry.url.includes('/products/1111'))!
    expect(Object.keys(product)).toEqual(['url'])
    // Only active products were requested from the backend in the first place.
    expect(getProducts).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true }),
      expect.anything(),
    )
  })

  it('drops an inactive product even if the API returned one', async () => {
    getProducts.mockResolvedValue({ totalCount: 1, items: [productListItem('dead', false)] })
    const sitemap = await loadSitemap()
    expect((await sitemap()).some((entry) => entry.url.includes('/products/dead'))).toBe(false)
  })

  it('follows pagination until every product is listed', async () => {
    const page = (start: number, count: number) =>
      Array.from({ length: count }, (_, index) => productListItem(`p-${start + index}`))
    getProducts
      .mockResolvedValueOnce({ totalCount: 150, items: page(0, 100) })
      .mockResolvedValueOnce({ totalCount: 150, items: page(100, 50) })
    const sitemap = await loadSitemap()
    const urls = (await sitemap()).filter((entry) => entry.url.includes('/products/'))
    expect(urls).toHaveLength(150)
    expect(getProducts).toHaveBeenCalledTimes(2)
  })

  it('emits each product once even if the API repeats one', async () => {
    getProducts.mockResolvedValue({
      totalCount: 2,
      items: [productListItem('dupe'), productListItem('dupe')],
    })
    const sitemap = await loadSitemap()
    expect((await sitemap()).filter((entry) => entry.url.endsWith('/products/dupe'))).toHaveLength(1)
  })

  it('keeps every static entry when the catalogue is unreachable', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    getProducts.mockRejectedValue(new Error('ECONNREFUSED'))
    const sitemap = await loadSitemap()
    const urls = (await sitemap()).map((entry) => entry.url)

    expect(urls).toContain(`${ORIGIN}/`)
    expect(urls).toContain(`${ORIGIN}/services`)
    expect(urls).toContain(`${ORIGIN}/help/faq`)
    expect(urls.some((url) => url.includes('/products/'))).toBe(false)

    // Logged without a URL, a stack or any customer data.
    expect(error).toHaveBeenCalledWith(expect.stringContaining('[sitemap] catalogue unavailable'))
    expect(String(error.mock.calls[0][0])).not.toContain('ECONNREFUSED')
  })
})

describe('portfolio entries', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_PORTFOLIO_ENABLED', 'true')
  })

  it('lists published items with their real publication date', async () => {
    listPage.mockResolvedValue({ totalCount: 1, items: [portfolioItem('church-camp-tees')] })
    const sitemap = await loadSitemap()
    const entry = (await sitemap()).find((candidate) => candidate.url.endsWith('/portfolio/church-camp-tees'))!
    expect(entry.lastModified).toEqual(new Date('2026-07-01T00:00:00Z'))
  })

  it('drops draft and archived items and items with no slug', async () => {
    listPage.mockResolvedValue({
      totalCount: 3,
      items: [
        portfolioItem('draft-work', { status: 'Draft' }),
        portfolioItem('archived-work', { status: 'Archived' }),
        portfolioItem('', { slug: '' }),
      ],
    })
    const sitemap = await loadSitemap()
    const urls = (await sitemap()).map((entry) => entry.url)
    expect(urls.some((url) => url.includes('/portfolio/draft-work'))).toBe(false)
    expect(urls.some((url) => url.includes('/portfolio/archived-work'))).toBe(false)
    expect(urls).not.toContain(`${ORIGIN}/portfolio/`)
  })

  it('omits lastModified when no publication date is recorded', async () => {
    listPage.mockResolvedValue({ totalCount: 1, items: [portfolioItem('x', { publishedAt: undefined })] })
    const sitemap = await loadSitemap()
    const entry = (await sitemap()).find((candidate) => candidate.url.endsWith('/portfolio/x'))!
    expect(entry.lastModified).toBeUndefined()
  })

  it('keeps the static entries when the portfolio API fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    listPage.mockRejectedValue(new Error('boom'))
    const sitemap = await loadSitemap()
    const urls = (await sitemap()).map((entry) => entry.url)
    expect(urls).toContain(`${ORIGIN}/`)
    expect(urls).toContain(`${ORIGIN}/portfolio`)
  })

  it('reads no portfolio data at all while the feature is off', async () => {
    vi.stubEnv('NEXT_PUBLIC_PORTFOLIO_ENABLED', 'false')
    const sitemap = await loadSitemap()
    await sitemap()
    expect(listPage).not.toHaveBeenCalled()
  })
})

describe('fail-closed', () => {
  it('returns nothing rather than guessing an origin', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv(SITE_URL_ENV_VAR, '')
    const sitemap = await loadSitemap()
    expect(await sitemap()).toEqual([])
    expect(error).toHaveBeenCalledWith(expect.stringContaining('no public site origin'))
  })

  it('contains no duplicate URL', async () => {
    getProducts.mockResolvedValue({ totalCount: 1, items: [productListItem('p1')] })
    const sitemap = await loadSitemap()
    const urls = (await sitemap()).map((entry) => entry.url)
    expect(new Set(urls).size).toBe(urls.length)
  })
})
