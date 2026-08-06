import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeJsonLd } from '@/components/seo/JsonLd'
import { publishedServices, findService, resolveService } from '@/lib/service-content/registry'
import { PRODUCT_ID, productFixture } from '@/test/product-fixtures'
import type { PortfolioItem } from '@/api/portfolio'
import type { Product } from '@/types'
import { SITE_URL_ENV_VAR } from '../site-url'
import { buildBreadcrumbList } from './breadcrumb'
import { buildFaqPage } from './faq'
import { buildLocalBusiness, buildOrganization, buildWebSite, siteGraph } from './organization'
import { buildOffer, buildProduct, publicUnitPrices } from './product'
import { buildPortfolioWork } from './portfolio'
import { buildService } from './service'
import { validateGraph } from './validate'
import type { SchemaNode } from './types'

/**
 * Jira 10308 — typed structured-data builders.
 *
 * The recurring assertion in this file is not "the node has the right shape" but "the node is
 * absent, or the field is absent, when the underlying fact is not ours to publish". Omission is the
 * expected result for most of the graph today.
 */

const ORIGIN = 'https://www.example.com'

const APPROVAL_FLAGS = [
  'NEXT_PUBLIC_BUSINESS_IDENTITY_APPROVED',
  'NEXT_PUBLIC_BUSINESS_ADDRESS_APPROVED',
  'NEXT_PUBLIC_BUSINESS_HOURS_APPROVED',
  'NEXT_PUBLIC_PUBLIC_EMAIL_ROLE_APPROVED',
]

beforeEach(() => {
  vi.stubEnv(SITE_URL_ENV_VAR, ORIGIN)
  for (const flag of APPROVAL_FLAGS) vi.stubEnv(flag, '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

/** Convenience: validate a graph and fail with the readable list of issues. */
const expectValid = (graph: readonly (SchemaNode | null)[]) => {
  const nodes = graph.filter((node): node is SchemaNode => node !== null)
  expect(validateGraph(nodes)).toEqual([])
  return nodes
}

// ── Breadcrumbs ──────────────────────────────────────────────────────────────

describe('BreadcrumbList', () => {
  it('numbers from 1, links every ancestor absolutely and leaves the current page unlinked', () => {
    const node = buildBreadcrumbList('/services/pvc-banners', [
      { name: 'Home', path: '/' },
      { name: 'Services', path: '/services' },
      { name: 'PVC banners' },
    ])!
    expect(node['@id']).toBe(`${ORIGIN}/services/pvc-banners#breadcrumb`)
    expect(node.itemListElement.map((item) => item.position)).toEqual([1, 2, 3])
    expect(node.itemListElement[0].item).toBe(`${ORIGIN}/`)
    expect(node.itemListElement[1].item).toBe(`${ORIGIN}/services`)
    expect(node.itemListElement[2]).not.toHaveProperty('item')
    expectValid([node])
  })

  it('keeps an intentionally unlinked crumb as a name-only item', () => {
    const node = buildBreadcrumbList('/help/faq', [
      { name: 'Home', path: '/' },
      { name: 'Help' },
      { name: 'Frequently asked questions' },
    ])!
    expect(node.itemListElement[1]).toEqual({ '@type': 'ListItem', position: 2, name: 'Help' })
    expectValid([node])
  })

  it('strips a query string from a crumb URL', () => {
    const node = buildBreadcrumbList('/products/x', [
      { name: 'Products', path: '/products?category=badges' },
      { name: 'X' },
    ])!
    expect(node.itemListElement[0].item).toBe(`${ORIGIN}/products`)
  })

  it('emits nothing for a one-item trail or with no site origin', () => {
    expect(buildBreadcrumbList('/x', [{ name: 'Only' }])).toBeNull()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv(SITE_URL_ENV_VAR, '')
    expect(buildBreadcrumbList('/a', [{ name: 'Home', path: '/' }, { name: 'A' }])).toBeNull()
  })
})

// ── FAQ ──────────────────────────────────────────────────────────────────────

describe('FAQPage', () => {
  const entries = [
    { question: 'Is a quote an order?', answer: 'No. A quote request is an enquiry.' },
    { question: 'Can I upload artwork?', answer: 'Yes, in two places.' },
  ]

  it('carries the visible question and answer text unchanged', () => {
    const node = buildFaqPage('/help/faq', entries, { indexable: true })!
    expect(node['@id']).toBe(`${ORIGIN}/help/faq#faq`)
    expect(node.mainEntity).toHaveLength(2)
    expect(node.mainEntity[0].name).toBe(entries[0].question)
    expect(node.mainEntity[0].acceptedAnswer.text).toBe(entries[0].answer)
    expectValid([node])
  })

  it('emits nothing on a noindex page and nothing when no entry has an answer', () => {
    expect(buildFaqPage('/help/faq', entries, { indexable: false })).toBeNull()
    expect(buildFaqPage('/help/faq', [], { indexable: true })).toBeNull()
    expect(
      buildFaqPage('/help/faq', [{ question: 'Q', answer: '   ' }], { indexable: true }),
    ).toBeNull()
  })
})

// ── Service ──────────────────────────────────────────────────────────────────

describe('Service', () => {
  it('describes every published service with no commercial fact attached', () => {
    for (const definition of publishedServices()) {
      const node = buildService(definition, { indexable: true })!
      expect(node.name).toBe(definition.name)
      expect(node.description).toBe(definition.description)
      expect(node.url).toBe(`${ORIGIN}/services/${definition.slug}`)
      // The whole prohibited set, in one assertion per service.
      for (const key of [
        'offers',
        'price',
        'priceRange',
        'areaServed',
        'aggregateRating',
        'review',
        'award',
        'hoursAvailable',
        'termsOfService',
        'image',
      ]) {
        expect(node, `${definition.slug}.${key}`).not.toHaveProperty(key)
      }
      expectValid([node])
    }
  })

  it('omits the provider while the business identity is unapproved', () => {
    const node = buildService(publishedServices()[0], { indexable: true })!
    expect(node).not.toHaveProperty('provider')
  })

  it('references the business entity once identity and address are approved', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_IDENTITY_APPROVED', 'true')
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_ADDRESS_APPROVED', 'true')
    vi.resetModules()
    const { buildService: build } = await import('./service')
    const node = build(publishedServices()[0], { indexable: true })!
    expect(node.provider).toEqual({ '@id': `${ORIGIN}/#organization` })
  })

  it('emits nothing for a draft preview', () => {
    // Every service in the registry is published, so a draft is simulated through the flag the
    // route passes rather than by adding an unpublishable definition.
    const definition = publishedServices()[0]
    expect(buildService(definition, { indexable: false })).toBeNull()
  })

  it('describes no service the registry would not publish', () => {
    const resolved = resolveService('not-a-service')
    expect(resolved).toBeUndefined()
    expect(findService('not-a-service')).toBeUndefined()
  })
})

// ── Product and Offer ────────────────────────────────────────────────────────

/**
 * The product builders resolve image URLs against `NEXT_PUBLIC_API_BASE_URL`, which `image-utils`
 * reads once at module load. These tests point it at a non-local host and re-import, both so the
 * "public catalogue image" rule is exercised against a realistic origin and so the graph validator's
 * localhost rule is not tripped by the development default.
 */
const CATALOGUE_ORIGIN = 'https://images.example.com'

async function loadProductBuilders() {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', CATALOGUE_ORIGIN)
  vi.resetModules()
  return import('./product')
}

/** A badge with a real, publicly displayed quantity ladder. */
const badgeFixture = (): Product =>
  productFixture({
    kind: 'Badge',
    name: '58mm Button Badge',
    description: 'Round pin badge, printed to order.',
    quantityPriceTiers: [
      { id: 't1', productId: PRODUCT_ID, minQuantity: 10, unitPrice: 3.5, isActive: true, sortOrder: 0 },
      { id: 't2', productId: PRODUCT_ID, minQuantity: 100, unitPrice: 1.8, isActive: true, sortOrder: 1 },
      { id: 't3', productId: PRODUCT_ID, minQuantity: 500, unitPrice: 0, isActive: false, sortOrder: 2 },
    ],
  })

describe('Product', () => {
  it('uses only real catalogue facts and invents no identifier or brand', async () => {
    const { buildProduct } = await loadProductBuilders()
    const node = buildProduct(productFixture())!
    expect(node['@id']).toBe(`${ORIGIN}/products/${PRODUCT_ID}#product`)
    expect(node.url).toBe(`${ORIGIN}/products/${PRODUCT_ID}`)
    expect(node.name).toBe('Gildan Heavy Cotton Tee')
    expect(node.description).toBe('Mid-weight cotton crew neck, printed in Otahuhu.')
    expect(node.category).toBe('Garment printing')
    // No SKU is invented, and the GUID is not repurposed as one.
    expect(node).not.toHaveProperty('sku')
    // The shop prints on these blanks; it does not manufacture them.
    expect(node).not.toHaveProperty('brand')
    expect(node).not.toHaveProperty('manufacturer')
    expectValid([node])
  })

  it('publishes only publicly served catalogue images', async () => {
    const { buildProduct } = await loadProductBuilders()
    const node = buildProduct(productFixture())!
    expect(node.image).toEqual([`${CATALOGUE_ORIGIN}/uploads/products/gildan.png`])
  })

  it('never publishes customer design artwork or a third-party image row', async () => {
    const { buildProduct } = await loadProductBuilders()
    const node = buildProduct(
      productFixture({
        images: [
          // Private customer artwork lives under /uploads/designs/.
          { id: 'a', productId: PRODUCT_ID, url: '/uploads/designs/customer-logo.png', color: null, isPrimary: true, sortOrder: 0 },
          // An absolute URL an Admin stored pointing somewhere we cannot vouch for.
          { id: 'b', productId: PRODUCT_ID, url: 'https://untrusted.example.net/x.png', color: null, isPrimary: false, sortOrder: 1 },
        ],
      } as never),
    )!
    expect(node).not.toHaveProperty('image')
  })

  it('omits a description rather than repeating the page’s fallback sentence', async () => {
    const { buildProduct } = await loadProductBuilders()
    expect(buildProduct(productFixture({ description: null }))!).not.toHaveProperty('description')
  })

  it('emits nothing for an inactive product', async () => {
    const { buildProduct } = await loadProductBuilders()
    expect(buildProduct(productFixture({ isActive: false }))).toBeNull()
  })

  it('emits nothing when no site origin is available', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv(SITE_URL_ENV_VAR, '')
    const { buildProduct } = await loadProductBuilders()
    expect(buildProduct(productFixture())).toBeNull()
  })
})

describe('Offer eligibility', () => {
  it('is emitted for a badge from its active quantity ladder', async () => {
    const { buildProduct } = await loadProductBuilders()
    const node = buildProduct(badgeFixture())!
    expect(node.offers).toEqual({
      '@type': 'AggregateOffer',
      priceCurrency: 'NZD',
      lowPrice: 1.8,
      highPrice: 3.5,
      offerCount: 2,
      url: `${ORIGIN}/products/${PRODUCT_ID}`,
    })
    expectValid([node])
  })

  it('is emitted for a fixed-size banner from its active size options', async () => {
    const { buildProduct } = await loadProductBuilders()
    const banner = productFixture({
      kind: 'Banner',
      pricingModel: 'FixedSize',
      fixedSizePriceOptions: [
        { id: 'o1', productId: PRODUCT_ID, label: '850x2000', width: 850, height: 2000, unit: 'mm', unitPrice: 189, isActive: true, sortOrder: 0 },
        { id: 'o2', productId: PRODUCT_ID, label: '1000x2000', width: 1000, height: 2000, unit: 'mm', unitPrice: 219, isActive: true, sortOrder: 1 },
      ],
    } as never)
    expect(buildProduct(banner)!.offers).toMatchObject({
      priceCurrency: 'NZD',
      lowPrice: 189,
      highPrice: 219,
    })
  })

  it('is omitted for a garment, whose visible price is a print-dependent reference figure', async () => {
    const { buildProduct, publicUnitPrices } = await loadProductBuilders()
    expect(publicUnitPrices(productFixture())).toEqual([])
    expect(buildProduct(productFixture())).not.toHaveProperty('offers')
  })

  it('is omitted for quote-only and area-based products', async () => {
    const { buildProduct } = await loadProductBuilders()
    for (const pricingModel of ['CustomQuoteOnly', 'AreaBased'] as const) {
      const banner = productFixture({ kind: 'Banner', pricingModel })
      expect(buildProduct(banner), pricingModel).not.toHaveProperty('offers')
    }
    expect(buildProduct(productFixture({ kind: 'Other' }))).not.toHaveProperty('offers')
  })

  it('is omitted when every price is zero, negative or non-finite', async () => {
    const { buildOffer } = await loadProductBuilders()
    for (const unitPrice of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const badge = productFixture({
        kind: 'Badge',
        quantityPriceTiers: [
          { id: 't', productId: PRODUCT_ID, minQuantity: 10, unitPrice, isActive: true, sortOrder: 0 },
        ],
      } as never)
      expect(buildOffer(badge), String(unitPrice)).toBeNull()
    }
  })

  it('ignores inactive tiers, which are not publicly displayed prices', async () => {
    const { publicUnitPrices } = await loadProductBuilders()
    expect(publicUnitPrices(badgeFixture())).toEqual([3.5, 1.8])
  })

  it('never states availability, price validity, shipping, returns, rating or review', async () => {
    const { buildProduct } = await loadProductBuilders()
    const serialized = JSON.stringify(buildProduct(badgeFixture()))
    for (const forbidden of [
      'availability',
      'InStock',
      'priceValidUntil',
      'shippingDetails',
      'MerchantReturnPolicy',
      'hasMerchantReturnPolicy',
      'aggregateRating',
      'review',
    ]) {
      expect(serialized, forbidden).not.toContain(forbidden)
    }
  })

  it('does not turn isActive into a stock claim', async () => {
    const { buildProduct } = await loadProductBuilders()
    // Both products are active. Neither says anything about whether stock is on the shelf.
    for (const product of [productFixture(), badgeFixture()]) {
      expect(product.isActive).toBe(true)
      expect(JSON.stringify(buildProduct(product))).not.toMatch(/InStock|OutOfStock|availability/i)
    }
  })
})

// ── Portfolio ────────────────────────────────────────────────────────────────

const portfolioFixture = (overrides: Partial<PortfolioItem> = {}): PortfolioItem => ({
  id: 'p1',
  title: 'Church camp tees',
  slug: 'church-camp-tees',
  serviceType: 'GarmentPrinting',
  shortCaption: 'Forty screen-printed tees for a weekend camp.',
  status: 'Published',
  sortOrder: 0,
  isFeatured: false,
  publishedAt: '2026-07-01T00:00:00Z',
  concurrencyStamp: 'stamp-should-never-be-published',
  images: [
    {
      id: 'i1',
      altText: 'Stack of printed navy T-shirts',
      permissionSource: 'CustomerPermission',
      permissionReference: 'EMAIL-2026-07-01',
      originalFileName: 'DSC_0041.jpg',
      width: 1600,
      height: 1200,
      isPrimary: true,
      sortOrder: 0,
      url: 'https://cdn.example.com/portfolio/i1.jpg',
    },
  ],
  ...overrides,
})

describe('portfolio CreativeWork', () => {
  it('publishes the visible fields and no internal bookkeeping', () => {
    const node = buildPortfolioWork(portfolioFixture(), { indexable: true })!
    expect(node.name).toBe('Church camp tees')
    expect(node.url).toBe(`${ORIGIN}/portfolio/church-camp-tees`)
    expect(node.description).toBe('Forty screen-printed tees for a weekend camp.')
    expect(node.about).toBe('Garment Printing')
    expect(node.datePublished).toBe('2026-07-01T00:00:00.000Z')
    expect(node.image?.[0]).toMatchObject({ width: 1600, height: 1200, caption: 'Stack of printed navy T-shirts' })

    const serialized = JSON.stringify(node)
    for (const forbidden of ['permissionSource', 'permissionReference', 'EMAIL-2026', 'DSC_0041', 'concurrencyStamp', 'stamp-should-never']) {
      expect(serialized, forbidden).not.toContain(forbidden)
    }
    expectValid([node])
  })

  it('omits datePublished rather than substituting the build time', () => {
    const node = buildPortfolioWork(portfolioFixture({ publishedAt: undefined }), { indexable: true })!
    expect(node).not.toHaveProperty('datePublished')
  })

  it('emits nothing for Draft or Archived work, or on a noindex page', () => {
    expect(buildPortfolioWork(portfolioFixture({ status: 'Draft' }), { indexable: true })).toBeNull()
    expect(buildPortfolioWork(portfolioFixture({ status: 'Archived' }), { indexable: true })).toBeNull()
    expect(buildPortfolioWork(portfolioFixture(), { indexable: false })).toBeNull()
  })

  it('adds no rating, endorsement, award or copyright holder', () => {
    const serialized = JSON.stringify(buildPortfolioWork(portfolioFixture(), { indexable: true }))
    for (const forbidden of ['aggregateRating', 'review', 'award', 'copyrightHolder', 'endorse']) {
      expect(serialized, forbidden).not.toContain(forbidden)
    }
  })
})

// ── Site graph ───────────────────────────────────────────────────────────────

describe('site graph', () => {
  it('publishes the WebSite node and nothing else while the identity is unapproved', () => {
    const nodes = siteGraph()
    expect(nodes.map((node) => node['@type'])).toEqual(['WebSite'])
    expect(buildLocalBusiness()).toBeNull()
    expect(buildOrganization()).toBeNull()
    expectValid(nodes)
  })

  it('describes the website without address, hours, phone or rating', () => {
    const node = buildWebSite()!
    expect(node).toEqual({
      '@type': 'WebSite',
      '@id': `${ORIGIN}/#website`,
      name: 'Otahuhu Printing Shop',
      url: `${ORIGIN}/`,
      inLanguage: 'en-NZ',
    })
  })

  it('declares no SearchAction, because no public search-results contract exists', () => {
    expect(JSON.stringify(siteGraph())).not.toContain('SearchAction')
  })

  it('publishes a LocalBusiness once identity and address are approved, with only approved fields', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_IDENTITY_APPROVED', 'true')
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_ADDRESS_APPROVED', 'true')
    vi.resetModules()
    const { buildLocalBusiness: build, buildOrganization: buildOrg } = await import('./organization')
    const node = build()!
    expect(node['@type']).toBe('LocalBusiness')
    expect(node.name).toBe('Otahuhu Printing Shop')
    expect(node.address).toMatchObject({ streetAddress: '483 Great South Road', addressCountry: 'NZ' })
    // Hours, phone, email, legal name, logo, areaServed and priceRange each need their own approval.
    for (const key of ['openingHoursSpecification', 'telephone', 'email', 'legalName', 'logo', 'areaServed', 'priceRange', 'sameAs', 'aggregateRating', 'review']) {
      expect(node, key).not.toHaveProperty(key)
    }
    // Organization is not duplicated alongside LocalBusiness.
    expect(buildOrg()).toBeNull()
    expectValid([node])
  })

  it('adds opening hours only once they are separately approved', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_IDENTITY_APPROVED', 'true')
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_ADDRESS_APPROVED', 'true')
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_HOURS_APPROVED', 'true')
    vi.resetModules()
    const { buildLocalBusiness: build } = await import('./organization')
    const node = build()!
    expect(node.openingHoursSpecification).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '09:00',
        closes: '17:00',
      },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday'], opens: '10:00', closes: '16:00' },
    ])
  })

  it('never presents the temporary app icon as the business logo', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_IDENTITY_APPROVED', 'true')
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_ADDRESS_APPROVED', 'true')
    vi.resetModules()
    const { buildLocalBusiness: build } = await import('./organization')
    const serialized = JSON.stringify(build())
    for (const asset of ['icon.svg', 'apple-icon', 'favicon']) {
      expect(serialized, asset).not.toContain(asset)
    }
  })
})

// ── Validation and serialization ─────────────────────────────────────────────

describe('graph validation', () => {
  it('flags nulls, empty strings, empty arrays, relative URLs and missing @type', () => {
    const issues = validateGraph([
      { '@type': 'Product', name: '', url: '/relative', image: [], description: null },
      { name: 'no type' },
    ])
    const messages = issues.map((issue) => issue.message).join(' | ')
    expect(messages).toContain('empty string')
    expect(messages).toContain('not absolute')
    expect(messages).toContain('empty array')
    expect(messages).toContain('null is not permitted')
    expect(messages).toContain('no @type')
  })

  it('flags forbidden commercial and internal properties wherever they appear', () => {
    const issues = validateGraph([
      {
        '@type': 'Product',
        name: 'x',
        offers: { '@type': 'Offer', availability: 'InStock', priceValidUntil: '2027-01-01' },
        permissionReference: 'EMAIL-1',
      },
    ])
    const flagged = issues.map((issue) => issue.path)
    expect(flagged).toEqual(
      expect.arrayContaining([
        '@graph[0].offers.availability',
        '@graph[0].offers.priceValidUntil',
        '@graph[0].permissionReference',
      ]),
    )
  })

  it('flags a localhost URL and an internal path', () => {
    const issues = validateGraph([
      { '@type': 'WebSite', name: 'x', url: 'http://localhost:3000/' },
      { '@type': 'Product', name: 'y', url: 'https://x.test/admin/products/1' },
    ])
    expect(issues.map((issue) => issue.message).join(' | ')).toMatch(/local origin|forbidden value/)
  })

  it('flags two different node types sharing one @id', () => {
    const issues = validateGraph([
      { '@type': 'WebSite', '@id': 'https://x.test/#a', name: 'x', url: 'https://x.test/' },
      { '@type': 'Product', '@id': 'https://x.test/#a', name: 'y', url: 'https://x.test/p' },
    ])
    expect(issues.map((issue) => issue.message).join(' | ')).toContain('reused by a different @type')
  })
})

describe('JSON-LD serialization', () => {
  it('escapes the sequence that would terminate the script element', async () => {
    const { buildProduct } = await loadProductBuilders()
    const hostile = productFixture({
      name: 'Tee </script><img src=x onerror=alert(1)>',
      description: 'Contains <b>markup</b> & an ampersand',
    })
    const serialized = serializeJsonLd([buildProduct(hostile)!])

    expect(serialized).not.toContain('</script')
    expect(serialized).not.toContain('<')
    expect(serialized).not.toContain('>')
    expect(serialized).toContain('\\u003c')
    // Still valid JSON, and the escapes round-trip to the original text.
    const parsed = JSON.parse(serialized) as { '@graph': { name: string; description: string }[] }
    expect(parsed['@graph'][0].name).toBe('Tee </script><img src=x onerror=alert(1)>')
    expect(parsed['@graph'][0].description).toBe('Contains <b>markup</b> & an ampersand')
  })

  it('escapes the line terminators that are legal in JSON but not in JavaScript', () => {
    // Written as escapes so the raw characters never appear in this source file.
    const u2028 = '\u2028'
    const u2029 = '\u2029'
    const name = `a${u2028}b${u2029}c`
    const serialized = serializeJsonLd([
      { '@type': 'WebSite', name, url: 'https://x.test/' },
    ])
    expect(serialized).not.toContain(u2028)
    expect(serialized).not.toContain(u2029)
    expect(serialized).toContain('\\u2028')
    expect(JSON.parse(serialized)['@graph'][0].name).toBe(name)
  })

  it('wraps the nodes in one @graph with the schema.org context', () => {
    const parsed = JSON.parse(serializeJsonLd(siteGraph()))
    expect(parsed['@context']).toBe('https://schema.org')
    expect(Array.isArray(parsed['@graph'])).toBe(true)
  })
})
