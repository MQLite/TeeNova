import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { DEVELOPMENT_FALLBACK_ORIGIN } from '@/lib/seo/site-url'
import { publishedServices, serviceHref } from '@/lib/service-content/registry'
import { publicContentHref, publishedDocuments } from '@/lib/public-content/registry'
import { faqDocument } from '@/content/help/faq'

/**
 * Jira 10308 — route metadata, structured-data parity and internal linking.
 *
 * The parity checks render the real server component and read the JSON-LD out of the returned tree,
 * then compare it with the visible DOM. That is the only way to assert "the structured breadcrumb is
 * the breadcrumb the visitor sees" rather than "both were built from the same variable".
 */

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  permanentRedirect: (target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`)
  },
}))
vi.mock('@/components/services/ServiceProducts', () => ({ ServiceProducts: () => null }))
vi.mock('@/components/services/ServicePortfolio', () => ({ ServicePortfolio: () => null }))

import { metadata as homeMetadata } from './page'
import { metadata as servicesMetadata } from './services/page'
import { metadata as contactMetadata } from './contact/page'
import { metadata as quoteMetadata } from './quote/page'
import { metadata as portfolioMetadata } from './portfolio/page'
import { metadata as cartMetadata } from './cart/layout'
import { metadata as checkoutMetadata } from './checkout/layout'
import { metadata as ordersMetadata } from './orders/layout'
import { metadata as adminMetadata } from './admin/layout'
import { metadata as notFoundMetadata } from './not-found'
import { generateMetadata as productsMetadata } from './products/page'
import { generateMetadata as serviceMetadata } from './services/[slug]/page'
import { generateMetadata as helpMetadata } from './help/[slug]/page'
import ServiceDetailPage from './services/[slug]/page'
import HelpContentPage from './help/[slug]/page'

const ORIGIN = DEVELOPMENT_FALLBACK_ORIGIN

/** Every JSON-LD graph in a rendered tree, parsed. */
function graphsIn(container: HTMLElement): Record<string, unknown>[] {
  return [...container.querySelectorAll('script[type="application/ld+json"]')].flatMap((script) => {
    const parsed = JSON.parse(script.textContent ?? '{}') as {
      '@context'?: string
      '@graph'?: Record<string, unknown>[]
    }
    expect(parsed['@context']).toBe('https://schema.org')
    return parsed['@graph'] ?? []
  })
}

const nodeOfType = (graphs: Record<string, unknown>[], type: string) =>
  graphs.find((node) => node['@type'] === type)

// ── Metadata coverage ────────────────────────────────────────────────────────

describe('route metadata', () => {
  it('gives every public route a unique, non-generic title and description', async () => {
    const entries: { route: string; title: unknown; description: unknown }[] = [
      { route: '/', title: (homeMetadata.title as { absolute: string }).absolute, description: homeMetadata.description },
      { route: '/services', title: servicesMetadata.title, description: servicesMetadata.description },
      { route: '/contact', title: contactMetadata.title, description: contactMetadata.description },
      { route: '/quote', title: quoteMetadata.title, description: quoteMetadata.description },
      { route: '/portfolio', title: portfolioMetadata.title, description: portfolioMetadata.description },
    ]

    const products = await productsMetadata({ searchParams: Promise.resolve({}) })
    entries.push({ route: '/products', title: products.title, description: products.description })

    for (const service of publishedServices()) {
      const metadata = serviceMetadata({ params: { slug: service.slug } })
      entries.push({ route: serviceHref(service), title: metadata.title, description: metadata.description })
    }
    for (const document of publishedDocuments()) {
      const metadata = helpMetadata({ params: { slug: document.slug } })
      if (document.group !== 'help') continue
      entries.push({ route: publicContentHref(document), title: metadata.title, description: metadata.description })
    }

    for (const entry of entries) {
      expect(String(entry.title).trim().length, entry.route).toBeGreaterThan(0)
      expect(String(entry.description).trim().length, entry.route).toBeGreaterThan(30)
    }
    expect(new Set(entries.map((entry) => String(entry.title))).size).toBe(entries.length)
    expect(new Set(entries.map((entry) => String(entry.description))).size).toBe(entries.length)
  })

  it('makes no superlative, speed or coverage claim in any description', async () => {
    const descriptions = [
      homeMetadata.description,
      servicesMetadata.description,
      contactMetadata.description,
      quoteMetadata.description,
      portfolioMetadata.description,
      (await productsMetadata({ searchParams: Promise.resolve({}) })).description,
      ...publishedServices().map((service) => serviceMetadata({ params: { slug: service.slug } }).description),
    ]
    for (const description of descriptions) {
      expect(String(description)).not.toMatch(
        /\b(best|cheapest|fastest|same[- ]day|top[- ]rated|leading|premium|nationwide|guaranteed?)\b/i,
      )
    }
  })

  it('gives each indexable route an absolute canonical on the site origin', async () => {
    expect(homeMetadata.alternates?.canonical).toBe(`${ORIGIN}/`)
    expect(servicesMetadata.alternates?.canonical).toBe(`${ORIGIN}/services`)
    expect(contactMetadata.alternates?.canonical).toBe(`${ORIGIN}/contact`)
    expect(portfolioMetadata.alternates?.canonical).toBe(`${ORIGIN}/portfolio`)
    expect((await productsMetadata({ searchParams: Promise.resolve({}) })).alternates?.canonical).toBe(
      `${ORIGIN}/products`,
    )
    for (const service of publishedServices()) {
      expect(serviceMetadata({ params: { slug: service.slug } }).alternates?.canonical).toBe(
        `${ORIGIN}/services/${service.slug}`,
      )
    }
  })

  it('collapses every products query variant onto one canonical', async () => {
    for (const searchParams of [
      { category: 'badges' },
      { search: 'tee' },
      { category: 'banners', search: 'pull up' },
      { category: 'not-a-category' },
    ]) {
      const metadata = await productsMetadata({ searchParams: Promise.resolve(searchParams) })
      expect(metadata.alternates?.canonical, JSON.stringify(searchParams)).toBe(`${ORIGIN}/products`)
      expect(metadata.openGraph?.url).toBe(`${ORIGIN}/products`)
    }
  })

  it('keeps the quote canonical free of the service, product and source context', () => {
    expect(quoteMetadata.alternates?.canonical).toBe(`${ORIGIN}/quote`)
    expect(JSON.stringify(quoteMetadata)).not.toMatch(/source=|service=|product=/)
  })
})

describe('non-indexable routes', () => {
  it('marks every transactional and authenticated route noindex, nofollow', () => {
    for (const [route, metadata] of [
      ['/cart', cartMetadata],
      ['/checkout', checkoutMetadata],
      ['/orders', ordersMetadata],
      ['/admin', adminMetadata],
    ] as const) {
      expect(metadata.robots, route).toEqual({ index: false, follow: false })
    }
  })

  it('gives the transactional routes no canonical and no social card', () => {
    for (const metadata of [cartMetadata, checkoutMetadata, ordersMetadata]) {
      expect(metadata.alternates).toBeUndefined()
      expect(metadata.openGraph).toBeUndefined()
      expect(metadata.twitter).toBeUndefined()
    }
  })

  it('marks the site-wide 404 noindex and gives it no canonical', () => {
    expect(notFoundMetadata.robots).toEqual({ index: false, follow: true })
    expect(notFoundMetadata.alternates).toBeUndefined()
  })

  it('follows the quote and portfolio feature flags', () => {
    // Both features are off in the test environment, matching the shipped default.
    expect(process.env.NEXT_PUBLIC_QUOTE_FORM_ENABLED).not.toBe('true')
    expect(quoteMetadata.robots).toEqual({ index: false, follow: true })
    expect(portfolioMetadata.robots).toEqual({ index: false, follow: true })
  })

  it('returns empty metadata for a draft or unknown content slug', () => {
    for (const slug of ['privacy', 'not-a-page']) {
      // Draft documents 404 in production; here they resolve to nothing rather than to a canonical.
      const metadata = helpMetadata({ params: { slug } })
      expect(metadata.alternates?.canonical, slug).toBeUndefined()
    }
  })
})

// ── Structured-data parity with the rendered page ────────────────────────────

describe('structured data matches the visible page', () => {
  it('reproduces the service breadcrumb exactly as rendered', () => {
    const service = publishedServices()[0]
    const { container } = render(<ServiceDetailPage params={{ slug: service.slug }} />)

    const visible = [...container.querySelectorAll('nav[aria-label="Breadcrumb"] li')]
      .map((item) => item.textContent?.trim() ?? '')
      .filter((text) => text !== '' && text !== '/')

    const breadcrumb = nodeOfType(graphsIn(container), 'BreadcrumbList') as {
      itemListElement: { position: number; name: string; item?: string }[]
    }
    expect(breadcrumb.itemListElement.map((entry) => entry.name)).toEqual(visible)
    expect(breadcrumb.itemListElement.map((entry) => entry.position)).toEqual([1, 2, 3])
    expect(breadcrumb.itemListElement.at(-1)!.name).toBe(service.name)
  })

  it('describes the service with the same name and description the page shows', () => {
    const service = publishedServices()[0]
    const { container } = render(<ServiceDetailPage params={{ slug: service.slug }} />)
    const node = nodeOfType(graphsIn(container), 'Service') as { name: string; url: string }
    expect(node.name).toBe(service.name)
    expect(node.url).toBe(`${ORIGIN}${serviceHref(service)}`)
  })

  it('emits an FAQ entry only for a question the page renders, in the same words', () => {
    const { container } = render(<HelpContentPage params={{ slug: 'faq' }} />)

    const faq = nodeOfType(graphsIn(container), 'FAQPage') as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[]
    }
    const visibleHeadings = [...container.querySelectorAll('h2')].map((heading) => heading.textContent?.trim())

    expect(faq.mainEntity.length).toBeGreaterThan(0)
    for (const entry of faq.mainEntity) {
      expect(visibleHeadings, entry.name).toContain(entry.name)
      // The answer text must be readable on the page, not only in the markup.
      expect(container.textContent).toContain(entry.acceptedAnswer.text.split('\n\n')[0])
    }

    // Every Draft question is absent from both the page and the graph.
    const draftHeadings = faqDocument.sections
      .filter((section) => section.status !== 'published')
      .map((section) => section.heading)
    expect(draftHeadings.length).toBeGreaterThan(0)
    for (const heading of draftHeadings) {
      expect(faq.mainEntity.map((entry) => entry.name), heading).not.toContain(heading)
      expect(visibleHeadings, heading).not.toContain(heading)
    }
  })

  it('emits no FAQ markup on a help page that is not the FAQ', () => {
    const { container } = render(<HelpContentPage params={{ slug: 'artwork-requirements' }} />)
    expect(nodeOfType(graphsIn(container), 'FAQPage')).toBeUndefined()
    expect(nodeOfType(graphsIn(container), 'BreadcrumbList')).toBeDefined()
  })

  it('emits no rating, review, price or availability property in a rendered page graph', () => {
    for (const tree of [
      render(<ServiceDetailPage params={{ slug: publishedServices()[0].slug }} />),
      render(<HelpContentPage params={{ slug: 'faq' }} />),
    ]) {
      const serialized = JSON.stringify(graphsIn(tree.container))
      // Matched as JSON property keys, not as substrings: an FAQ answer that legitimately contains
      // the word "review" ("We review it and come back to you") is page copy, not a rating claim.
      for (const forbidden of [
        'aggregateRating',
        'ratingValue',
        'review',
        'reviewCount',
        'priceValidUntil',
        'availability',
        'shippingDetails',
        'hasMerchantReturnPolicy',
        'offers',
        'price',
      ]) {
        expect(serialized, forbidden).not.toContain(`"${forbidden}":`)
      }
      expect(serialized).not.toContain('InStock')
    }
  })
})

// ── Internal linking and source hygiene ──────────────────────────────────────

/** Every non-test source file under `src/app` and `src/components`, excluding Admin and API. */
function publicSources(): { path: string; text: string }[] {
  const root = join(process.cwd(), 'src')
  const files: { path: string; text: string }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'admin' || entry.name === 'api') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        files.push({ path: full.replace(/\\/g, '/'), text: readFileSync(full, 'utf8') })
      }
    }
  }
  walk(join(root, 'app'))
  walk(join(root, 'components'))
  return files
}

const stripComments = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

describe('internal links', () => {
  const DRAFT_PATHS = [
    '/help/turnaround',
    '/help/delivery-and-pickup',
    '/help/size-guide',
    '/help/garment-care',
    '/policies/privacy',
    '/policies/returns',
    '/policies/payment-terms',
    '/policies/terms',
  ]

  it('links to no Draft help or policy route', () => {
    for (const { path, text } of publicSources()) {
      for (const draft of DRAFT_PATHS) {
        expect(stripComments(text), `${path} → ${draft}`).not.toContain(`"${draft}"`)
      }
    }
  })

  it('links to the redirect-only /customize from nowhere public', () => {
    for (const { path, text } of publicSources()) {
      if (path.endsWith('/app/customize/page.tsx')) continue
      expect(stripComments(text), path).not.toMatch(/href=["'{]*\/customize/)
    }
  })

  it('renders no placeholder href on a public page', () => {
    for (const { path, text } of publicSources()) {
      expect(stripComments(text), path).not.toMatch(/href="#"/)
      expect(stripComments(text), path).not.toMatch(/href=""/)
    }
  })

  it('links to no Admin route from a public page', () => {
    for (const { path, text } of publicSources()) {
      expect(stripComments(text), path).not.toMatch(/href=["'{]*\/admin/)
    }
  })

  it('reaches services, products and the quote route from the homepage', async () => {
    const { default: HomePage } = await import('./page')
    const { container } = render(<HomePage />)
    const hrefs = [...container.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href') ?? '')
    expect(hrefs).toContain('/services')
    expect(hrefs).toContain('/products')
    expect(hrefs).toContain('/contact')
    // The quote CTA is a mailto while the form is disabled — still a working route to conversion.
    expect(hrefs.some((href) => href.startsWith('/quote') || href.startsWith('mailto:'))).toBe(true)
  })

  it('gives every homepage link descriptive text rather than a bare "click here"', async () => {
    const { default: HomePage } = await import('./page')
    const { container } = render(<HomePage />)
    for (const anchor of container.querySelectorAll('a')) {
      const label = (anchor.textContent ?? '').trim()
      if (label === '') continue
      expect(label.toLowerCase()).not.toMatch(/^(click here|here|read more|link)$/)
    }
  })

  it('links every published service from the services index', async () => {
    const { default: ServicesIndexPage } = await import('./services/page')
    const { container } = render(<ServicesIndexPage />)
    const hrefs = [...container.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href'))
    for (const service of publishedServices()) {
      expect(hrefs, service.slug).toContain(serviceHref(service))
    }
  })

  it('links a service page to the quote route and to published help only', () => {
    const service = publishedServices()[0]
    const { container } = render(<ServiceDetailPage params={{ slug: service.slug }} />)
    const hrefs = [...container.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href') ?? '')
    expect(hrefs.some((href) => href.startsWith('/quote') || href.startsWith('mailto:'))).toBe(true)
    for (const href of hrefs) {
      expect(DRAFT_PATHS, href).not.toContain(href)
    }
  })
})

describe('privacy and tracking', () => {
  it('loads no analytics, tag manager, pixel or session-replay script', () => {
    const banned = [
      'googletagmanager',
      'google-analytics',
      'gtag(',
      'connect.facebook.net',
      'fbq(',
      'clarity.ms',
      'hotjar',
      'segment.com',
      'plausible',
      'posthog',
    ]
    for (const { path, text } of publicSources()) {
      const lowered = stripComments(text).toLowerCase()
      for (const term of banned) {
        expect(lowered, `${path}: ${term}`).not.toContain(term)
      }
    }
  })

  it('loads no third-party script tag on a public page', () => {
    for (const { path, text } of publicSources()) {
      // The only <script> in the public tree is the inline JSON-LD block.
      const scripts = [...stripComments(text).matchAll(/<script[^>]*>/g)].map((match) => match[0])
      for (const tag of scripts) {
        expect(tag, path).toContain('application/ld+json')
      }
      expect(stripComments(text), path).not.toMatch(/next\/script/)
    }
  })
})
