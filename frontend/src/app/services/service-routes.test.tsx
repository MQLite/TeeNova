import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

/**
 * Jira 10306 — service route behaviour.
 *
 * `notFound()` throws in Next.js, so "returns a real 404" is asserted by the route throwing rather
 * than rendering. These tests run outside a production build, so draft preview is active; the
 * production behaviour is covered in `service-production-gate.test.tsx`.
 *
 * The product and portfolio children are async server components, which React 18's test renderer
 * cannot render, so they are stubbed here. Their own selection rules are tested directly in
 * `service-integrations.test.tsx`.
 */

const notFoundError = new Error('NEXT_NOT_FOUND')
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw notFoundError
  },
  permanentRedirect: (target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`)
  },
}))
vi.mock('@/components/services/ServiceProducts', () => ({ ServiceProducts: () => null }))
vi.mock('@/components/services/ServicePortfolio', () => ({ ServicePortfolio: () => null }))

import ServiceDetailPage, {
  generateMetadata,
  generateStaticParams,
} from './[slug]/page'
import ServicesIndexPage from './page'
import { publishedServices } from '@/lib/service-content/registry'

const PUBLISHED_SLUGS = publishedServices().map((service) => service.slug)

describe('service index', () => {
  it('lists every published service and nothing else', () => {
    render(<ServicesIndexPage />)
    for (const service of publishedServices()) {
      expect(screen.getByRole('heading', { name: service.name, level: 3 })).toBeInTheDocument()
    }
    const cards = screen.getAllByRole('heading', { level: 3 })
    expect(cards).toHaveLength(publishedServices().length)
  })

  it('links each card to its own service route', () => {
    render(<ServicesIndexPage />)
    for (const service of publishedServices()) {
      const link = screen.getByRole('link', { name: new RegExp(service.name, 'i') })
      expect(link).toHaveAttribute('href', `/services/${service.slug}`)
    }
  })

  it('renders exactly one h1 and no empty card', () => {
    const { container } = render(<ServicesIndexPage />)
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    for (const heading of container.querySelectorAll('h3')) {
      expect(heading.textContent?.trim().length).toBeGreaterThan(0)
    }
  })

  it('offers a general quote action', () => {
    render(<ServicesIndexPage />)
    expect(screen.getByRole('link', { name: 'Request a quote for a print job' })).toBeInTheDocument()
  })
})

describe('generated route params', () => {
  it('pre-generates published service slugs only', () => {
    expect(generateStaticParams().map((param) => param.slug)).toEqual(PUBLISHED_SLUGS)
  })
})

describe('published service page', () => {
  it.each(PUBLISHED_SLUGS)('%s renders with exactly one h1 and ordered headings', (slug) => {
    const { container } = render(<ServiceDetailPage params={{ slug }} />)
    expect(container.querySelectorAll('h1')).toHaveLength(1)

    const levels = [...container.querySelectorAll('h1, h2, h3, h4')].map((node) =>
      Number(node.tagName.slice(1)),
    )
    expect(levels[0]).toBe(1)
    expect(Math.max(...levels)).toBeLessThanOrEqual(3)
    // No level is skipped: an h3 only ever follows an h2.
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index] - levels[index - 1]).toBeLessThanOrEqual(1)
    }
  })

  it.each(PUBLISHED_SLUGS)('%s renders a breadcrumb ending at the current page', (slug) => {
    render(<ServiceDetailPage params={{ slug }} />)
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(breadcrumb).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(within(breadcrumb).getByRole('link', { name: 'Services' })).toHaveAttribute('href', '/services')
    expect(within(breadcrumb).getByText(/./, { selector: '[aria-current="page"]' })).toBeInTheDocument()
  })

  it.each(PUBLISHED_SLUGS)('%s renders published sections only, with no empty heading', (slug) => {
    const { container } = render(<ServiceDetailPage params={{ slug }} />)
    for (const heading of container.querySelectorAll('h2, h3')) {
      expect(heading.textContent?.trim().length).toBeGreaterThan(0)
    }
    // Every in-page anchor resolves to a focusable target.
    const toc = screen.queryByRole('navigation', { name: 'On this page' })
    if (toc) {
      for (const anchor of within(toc).getAllByRole('link')) {
        const target = container.querySelector(`#${anchor.getAttribute('href')!.slice(1)}`)
        expect(target).not.toBeNull()
        expect(target).toHaveAttribute('tabindex', '-1')
      }
    }
  })

  it.each(PUBLISHED_SLUGS)('%s shows a machine-readable last-reviewed date', (slug) => {
    const { container } = render(<ServiceDetailPage params={{ slug }} />)
    expect(container.querySelector('time')).toHaveAttribute('dateTime', '2026-08-06')
  })

  it.each(PUBLISHED_SLUGS)('%s offers a descriptive, service-specific quote action', (slug) => {
    const service = publishedServices().find((candidate) => candidate.slug === slug)!
    render(<ServiceDetailPage params={{ slug }} />)
    expect(
      screen.getByRole('link', { name: `Request a quote for ${service.shortName}` }),
    ).toBeInTheDocument()
  })

  it.each(PUBLISHED_SLUGS)('%s links only to published help documents', (slug) => {
    render(<ServiceDetailPage params={{ slug }} />)
    const help = screen.queryByRole('navigation', { name: 'Helpful pages' })
    if (!help) return
    for (const link of within(help).getAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^\/help\/(artwork-requirements|faq)$/)
    }
  })

  it('does not render a Products or Recent work heading when nothing is mapped', () => {
    render(<ServiceDetailPage params={{ slug: 'business-cards' }} />)
    expect(screen.queryByRole('heading', { name: /products in our catalogue/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /recent .* work/i })).not.toBeInTheDocument()
  })

  it('throws a 404 for an unknown slug', () => {
    expect(() => render(<ServiceDetailPage params={{ slug: 'flag-printing' }} />)).toThrow(notFoundError)
  })
})

describe('service metadata', () => {
  it('gives every published service a unique title, description and canonical path', () => {
    const titles = new Set<string>()
    const descriptions = new Set<string>()
    for (const slug of PUBLISHED_SLUGS) {
      const metadata = generateMetadata({ params: { slug } })
      expect(metadata.title).toBeTruthy()
      expect(metadata.description).toBeTruthy()
      expect(metadata.alternates?.canonical).toBe(`/services/${slug}`)
      // A published page is indexable; only a draft preview is marked noindex.
      expect(metadata.robots).toBeUndefined()
      titles.add(String(metadata.title))
      descriptions.add(String(metadata.description))
    }
    expect(titles.size).toBe(PUBLISHED_SLUGS.length)
    expect(descriptions.size).toBe(PUBLISHED_SLUGS.length)
  })

  it('returns empty metadata for an unknown slug rather than inventing one', () => {
    expect(generateMetadata({ params: { slug: 'flag-printing' } })).toEqual({})
  })

  it('adds no structured data, sitemap entry or rating (Jira 10308 scope)', () => {
    for (const slug of PUBLISHED_SLUGS) {
      const metadata = generateMetadata({ params: { slug } }) as Record<string, unknown>
      expect(metadata.other).toBeUndefined()
      expect(JSON.stringify(metadata)).not.toMatch(/schema\.org|aggregateRating|Offer/i)
    }
  })
})
