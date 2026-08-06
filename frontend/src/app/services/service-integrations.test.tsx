import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ServiceQuoteCta } from '@/components/services/ServiceQuoteCta'
import { selectServiceProducts } from '@/components/services/ServiceProducts'
import { selectServicePortfolio } from '@/components/services/ServicePortfolio'
import { allServices, findService, publishedServices } from '@/lib/service-content/registry'
import type { PortfolioItem } from '@/api/portfolio'
import type { ProductListItem } from '@/types'

/**
 * Jira 10306 — how a service page joins onto the Jira 10301 quote workflow, the Jira 10302
 * portfolio and the live catalogue.
 */

const repoFile = (relative: string) => readFileSync(resolve(__dirname, '../../../..', relative), 'utf8')

/**
 * Source scans run against code only. Jira 10303 hit the same trap: a comment that quotes the claim
 * it removed trips the very scan asserting the removal.
 */
const repoCode = (relative: string) =>
  repoFile(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

// ── Quote integration ───────────────────────────────────────────────────────────────────────────

describe('quote integration', () => {
  // `quoteFormEnabled` is read once at module load, so the flag is exercised by resetting the
  // module graph and re-importing — the same way a rebuild picks up the build-time value.
  const withQuoteForm = async (enabled: boolean) => {
    vi.stubEnv('NEXT_PUBLIC_QUOTE_FORM_ENABLED', enabled ? 'true' : 'false')
    vi.resetModules()
    const loaded = await import('@/components/services/ServiceQuoteCta')
    return loaded.ServiceQuoteCta
  }

  it('preselects the correct service and carries a safe source path', async () => {
    const Cta = await withQuoteForm(true)
    render(
      <Cta serviceType="Banners" shortName="PVC banners" sourcePath="/services/pvc-banners" />,
    )
    const link = screen.getByRole('link', { name: 'Request a quote for PVC banners' })
    expect(link).toHaveAttribute('href', '/quote?service=banners&source=%2Fservices%2Fpvc-banners')
  })

  it('maps every published service to a quote slug the quote page can resolve', async () => {
    const { serviceFromSlug, SERVICE_OPTIONS } = await import('@/app/quote/quote-form-validation')
    const Cta = await withQuoteForm(true)
    for (const service of publishedServices()) {
      const { unmount } = render(
        <Cta
          serviceType={service.quoteServiceType}
          shortName={service.shortName}
          sourcePath={`/services/${service.slug}`}
        />,
      )
      const href = screen.getByRole('link', { name: `Request a quote for ${service.shortName}` })
        .getAttribute('href')!
      const slug = new URL(href, 'https://example.test').searchParams.get('service')!
      expect(SERVICE_OPTIONS.some((option) => option.slug === slug)).toBe(true)
      expect(serviceFromSlug(slug)).toBe(service.quoteServiceType)
      unmount()
    }
  })

  it('passes a product GUID through only when it is a valid GUID', async () => {
    const Cta = await withQuoteForm(true)
    const guid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
    const { unmount } = render(
      <Cta serviceType="Badges" shortName="badges" sourcePath="/services/x" productId={guid} />,
    )
    const href = screen.getByRole('link').getAttribute('href')!
    expect(href).toContain(`product=${guid}`)
    unmount()

    // The quote route validates the value; anything that is not a GUID is dropped there.
    const quotePage = repoFile('frontend/src/app/quote/page.tsx')
    expect(quotePage).toMatch(/isGuid\(searchParams\?\.product\)/)
  })

  it('falls back to the configured email address when the quote form is disabled', async () => {
    const Cta = await withQuoteForm(false)
    render(<Cta serviceType="Signage" shortName="signage" sourcePath="/services/signage" />)
    const link = screen.getByRole('link', { name: 'Request a quote for signage' })
    expect(link.getAttribute('href')).toMatch(/^mailto:/)
    expect(link.getAttribute('href')).not.toContain('undefined')
  })

  it('sends no customer data, price or token in the query string', () => {
    render(
      <ServiceQuoteCta serviceType="Banners" shortName="banners" sourcePath="/services/pvc-banners" />,
    )
    const href = screen.getByRole('link').getAttribute('href')!
    const query = href.includes('?') ? href.slice(href.indexOf('?') + 1) : ''
    const keys = [...new URLSearchParams(query).keys()]
    for (const key of keys) {
      expect(['service', 'product', 'source']).toContain(key)
    }
  })

  it('introduces no second enquiry endpoint', () => {
    const source = repoFile('frontend/src/components/services/ServiceQuoteCta.tsx')
    expect(source).toContain('QuoteLink')
    expect(source).not.toMatch(/fetch\(|apiClient|mailto:/)
    // Every service surface routes through the one centralised helper.
    for (const file of [
      'frontend/src/components/services/ServiceCard.tsx',
      'frontend/src/components/services/ServicePageLayout.tsx',
      'frontend/src/app/services/page.tsx',
      'frontend/src/app/services/[slug]/page.tsx',
    ]) {
      expect(repoFile(file)).not.toContain('mailto:')
    }
  })
})

// ── Portfolio integration ───────────────────────────────────────────────────────────────────────

describe('portfolio integration', () => {
  const item = (overrides: Partial<PortfolioItem>): PortfolioItem => ({
    id: overrides.id ?? '1',
    title: 'A job',
    slug: 'a-job',
    serviceType: 'Banners',
    shortCaption: 'A caption',
    status: 'Published',
    sortOrder: 0,
    isFeatured: false,
    images: [
      {
        id: 'i1',
        altText: 'Alt text',
        permissionSource: 'BusinessOwned',
        width: 800,
        height: 600,
        isPrimary: true,
        sortOrder: 0,
        url: '/api/portfolio/items/a-job/images/i1',
      },
    ],
    ...overrides,
  })

  const banners = findService('pvc-banners')!

  it('keeps published items whose service matches', () => {
    expect(selectServicePortfolio(banners, [item({ id: 'a' })])).toHaveLength(1)
  })

  it('drops draft and archived items even if the API returned them', () => {
    expect(selectServicePortfolio(banners, [item({ id: 'a', status: 'Draft' })])).toHaveLength(0)
    expect(selectServicePortfolio(banners, [item({ id: 'b', status: 'Archived' })])).toHaveLength(0)
  })

  it('drops items classified under a different service', () => {
    expect(selectServicePortfolio(banners, [item({ id: 'a', serviceType: 'Badges' })])).toHaveLength(0)
  })

  it('drops items with no image rather than rendering an empty tile', () => {
    expect(selectServicePortfolio(banners, [item({ id: 'a', images: [] })])).toHaveLength(0)
  })

  it('bounds how many items a service page shows', () => {
    const many = Array.from({ length: 12 }, (_, index) => item({ id: `item-${index}` }))
    expect(selectServicePortfolio(banners, many)).toHaveLength(3)
  })

  it('shows nothing when a service declares no portfolio classification', () => {
    expect(selectServicePortfolio({ ...banners, portfolioServiceType: undefined }, [item({ id: 'a' })]))
      .toHaveLength(0)
  })

  it('renders alt text and caption from the approved portfolio data, and no permission reference', () => {
    const source = repoFile('frontend/src/components/services/ServicePortfolio.tsx')
    expect(source).toContain('alt={image.altText}')
    expect(source).toContain('{item.shortCaption}')
    expect(source).not.toContain('permissionReference')
    expect(source).not.toMatch(/objectKey|originalFileName/)
  })

  it('requests only the published anonymous list, filtered by service', () => {
    const api = repoFile('frontend/src/api/portfolio.ts')
    expect(api).toContain("listByService")
    expect(api).toContain('/api/portfolio/items')
    expect(repoFile('frontend/src/components/services/ServicePortfolio.tsx')).not.toContain('admin')
  })
})

// ── Product integration ─────────────────────────────────────────────────────────────────────────

describe('product integration', () => {
  const product = (overrides: Partial<ProductListItem>): ProductListItem => ({
    id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    name: 'A product',
    basePrice: 10,
    productType: 'tshirt',
    kind: 'Garment',
    pricingModel: 'GarmentPrint',
    minimumQuantity: 1,
    isActive: true,
    thumbnailUrl: null,
    primaryImageUrl: null,
    variantCount: 1,
    fromPrice: null,
    hasPriceTiers: false,
    hero: null,
    ...overrides,
  })

  const garments = findService('custom-garment-printing')!
  const badges = findService('custom-round-button-badges')!

  it('selects active products of the mapped kind', () => {
    const selected = selectServiceProducts(garments, [
      product({ id: 'a' }),
      product({ id: 'b', kind: 'Badge' }),
    ])
    expect(selected.map((item) => item.id)).toEqual(['a'])
  })

  it('excludes inactive products', () => {
    expect(selectServiceProducts(garments, [product({ id: 'a', isActive: false })])).toHaveLength(0)
  })

  it('selects an explicitly mapped product id regardless of kind', () => {
    const id = '3f2504e0-4f89-11d3-9a0c-0305e82c3399'
    const service = { ...badges, relatedProductKinds: undefined, relatedProductIds: [id] }
    expect(selectServiceProducts(service, [product({ id, kind: 'Other' })])).toHaveLength(1)
  })

  it('selects nothing for a service with no catalogue mapping', () => {
    const quoteOnly = findService('business-cards')!
    expect(quoteOnly.relatedProductIds).toBeUndefined()
    expect(quoteOnly.relatedProductKinds).toBeUndefined()
    expect(selectServiceProducts(quoteOnly, [product({ id: 'a' })])).toHaveLength(0)
  })

  it('bounds how many products a service page shows', () => {
    const many = Array.from({ length: 20 }, (_, index) => product({ id: `p-${index}` }))
    expect(selectServiceProducts(garments, many)).toHaveLength(6)
  })

  it('links products through the existing GUID product route and card, adding no pricing logic', () => {
    const source = repoCode('frontend/src/components/services/ServiceProducts.tsx')
    expect(source).toContain('ProductCard')
    expect(repoFile('frontend/src/components/products/ProductCard.tsx')).toContain(
      'href={`/products/${product.id}`}',
    )
    // No configurator, no print-configuration read, no local price computation.
    expect(source).not.toMatch(/printConfigApi|pricingApi|calculateBatch|useState|formatMoney/)
    expect(source).toContain('isActive: true')
  })

  it('never states a price for a quote-only service', () => {
    for (const slug of ['business-cards', 'stickers-and-labels', 'signage', 'pull-up-banners']) {
      const service = findService(slug)!
      expect(service.facts.price).toBeUndefined()
      expect(service.relatedProductIds).toBeUndefined()
    }
  })
})

// ── Homepage and footer ─────────────────────────────────────────────────────────────────────────

describe('homepage and footer service links', () => {
  it('renders a homepage card for every published service and nothing else', async () => {
    const { default: HomePage } = await import('@/app/page')
    render(<HomePage />)
    const section = document.querySelector('#what-we-print')!
    for (const service of publishedServices()) {
      expect(within(section as HTMLElement).getByRole('heading', { name: service.name })).toBeInTheDocument()
    }
    expect(within(section as HTMLElement).getAllByRole('heading', { level: 3 })).toHaveLength(
      publishedServices().length,
    )
  })

  it('gives every homepage service card a real internal destination', async () => {
    const { default: HomePage } = await import('@/app/page')
    render(<HomePage />)
    const section = document.querySelector('#what-we-print') as HTMLElement
    const published = new Set(publishedServices().map((service) => `/services/${service.slug}`))
    for (const link of within(section).getAllByRole('link')) {
      const href = link.getAttribute('href')!
      expect(href === '/services' || published.has(href)).toBe(true)
      expect(href).not.toMatch(/^mailto:|^#$/)
    }
  })

  it('keeps the footer service links published-only and dead-link free', async () => {
    const { Footer } = await import('@/components/layout/Footer')
    render(<Footer />)
    const allowed = new Set([
      '/services',
      ...publishedServices().map((service) => `/services/${service.slug}`),
    ])
    const services = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/services'))
    expect(services.length).toBe(allowed.size)
    for (const link of services) {
      expect(allowed.has(link.getAttribute('href')!)).toBe(true)
    }
    for (const link of screen.getAllByRole('link')) {
      const href = link.getAttribute('href')!
      expect(href).not.toBe('')
      expect(href).not.toBe('#')
      expect(href).not.toContain('/customize')
    }
  })

  it('preserves the Jira 10303 help and policy links and the quote fallback', async () => {
    const { Footer } = await import('@/components/layout/Footer')
    render(<Footer />)
    expect(screen.getByRole('navigation', { name: 'Help and policies' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Artwork and file requirements' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a Quote' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Contact Us' })).toBeInTheDocument()
  })

  it('keeps the removed payment badges and delivery claims absent', async () => {
    const { Footer } = await import('@/components/layout/Footer')
    const { container } = render(<Footer />)
    const text = container.textContent!.toLowerCase()
    for (const claim of ['eftpos', 'bank transfer', 'free shipping', 'nz wide', 'nationwide']) {
      expect(text).not.toContain(claim)
    }
  })

  it('points the header Services link at the real index', () => {
    const source = repoFile('frontend/src/components/layout/Header.tsx')
    expect(source).toContain("{ href: '/services', label: 'Services' }")
  })

  it('preserves the Jira 10305 mobile hero spacing', async () => {
    const { default: HomePage } = await import('@/app/page')
    const { container } = render(<HomePage />)
    const hero = container.querySelector('section.hero-gradient')
    expect(hero).toHaveClass('py-8', 'sm:py-24', 'lg:py-36')
  })

  it('describes every service the same way on the homepage and the index', () => {
    for (const service of allServices) {
      expect(service.cardSummary.length).toBeGreaterThan(20)
      expect(service.shortName.length).toBeGreaterThan(2)
    }
  })
})
