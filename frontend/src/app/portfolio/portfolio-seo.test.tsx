import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { DEVELOPMENT_FALLBACK_ORIGIN } from '@/lib/seo/site-url'
import type { PortfolioItem } from '@/api/portfolio'

/**
 * Jira 10308 — structured data and metadata on the portfolio detail route.
 *
 * No approved Published portfolio media exists yet (Jira 10300 A31/A32), so the live route has
 * nothing to render and the runtime matrix records it as Blocked. These tests supply a controlled
 * Published item so the *behaviour* is verified: the graph carries the visible caption and image,
 * and none of the permission bookkeeping the admin model stores alongside it.
 */

const get = vi.fn<(slug: string) => Promise<PortfolioItem>>()
const notFoundError = new Error('NEXT_NOT_FOUND')

vi.mock('@/api/portfolio', () => ({
  portfolioApi: { get: (slug: string) => get(slug) },
  get portfolioEnabled() {
    return process.env.NEXT_PUBLIC_PORTFOLIO_ENABLED === 'true'
  },
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw notFoundError
  },
}))

import PortfolioDetailPage, { generateMetadata } from './[slug]/page'

const ORIGIN = DEVELOPMENT_FALLBACK_ORIGIN

const item = (overrides: Partial<PortfolioItem> = {}): PortfolioItem =>
  ({
    id: 'p1',
    title: 'Church camp tees',
    slug: 'church-camp-tees',
    serviceType: 'GarmentPrinting',
    shortCaption: 'Forty screen-printed tees for a weekend camp.',
    status: 'Published',
    sortOrder: 0,
    isFeatured: false,
    publishedAt: '2026-07-01T00:00:00Z',
    concurrencyStamp: 'internal-stamp',
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
        url: 'https://images.example.com/portfolio/i1.jpg',
      },
    ],
    ...overrides,
  }) as PortfolioItem

function graphsOf(container: HTMLElement): Record<string, unknown>[] {
  return [...container.querySelectorAll('script[type="application/ld+json"]')].flatMap((script) => {
    const parsed = JSON.parse(script.textContent ?? '{}') as { '@graph'?: Record<string, unknown>[] }
    return parsed['@graph'] ?? []
  })
}

const nodeOfType = (graph: Record<string, unknown>[], type: string) =>
  graph.find((node) => node['@type'] === type)

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_PORTFOLIO_ENABLED', 'true')
  get.mockReset()
})

describe('published portfolio detail', () => {
  it('describes the work with the caption and image the page shows', async () => {
    get.mockResolvedValue(item())
    const { container } = render(await PortfolioDetailPage({ params: { slug: 'church-camp-tees' } }))
    const work = nodeOfType(graphsOf(container), 'CreativeWork') as {
      name: string
      url: string
      description: string
      image: { url: string; caption: string }[]
      datePublished: string
    }

    expect(work.name).toBe('Church camp tees')
    expect(work.url).toBe(`${ORIGIN}/portfolio/church-camp-tees`)
    expect(container.textContent).toContain(work.description)
    expect(work.image[0].caption).toBe('Stack of printed navy T-shirts')
    expect(container.querySelector('img')?.getAttribute('alt')).toBe(work.image[0].caption)
    expect(work.datePublished).toBe('2026-07-01T00:00:00.000Z')
  })

  it('publishes no permission record, object key or original filename', async () => {
    get.mockResolvedValue(item())
    const { container } = render(await PortfolioDetailPage({ params: { slug: 'church-camp-tees' } }))
    const serialized = JSON.stringify(graphsOf(container))
    for (const secret of ['permissionSource', 'permissionReference', 'EMAIL-2026', 'DSC_0041', 'internal-stamp']) {
      expect(serialized, secret).not.toContain(secret)
      expect(container.innerHTML, secret).not.toContain(secret)
    }
  })

  it('matches the visible breadcrumb exactly', async () => {
    get.mockResolvedValue(item())
    const { container } = render(await PortfolioDetailPage({ params: { slug: 'church-camp-tees' } }))
    const crumbs = (nodeOfType(graphsOf(container), 'BreadcrumbList') as { itemListElement: { name: string }[] })
      .itemListElement.map((entry) => entry.name)
    const visible = [...container.querySelectorAll('nav[aria-label="Breadcrumb"] a, nav[aria-label="Breadcrumb"] span')]
      .map((node) => node.textContent?.trim() ?? '')
      .filter((text) => text !== '' && text !== '/')
    expect(crumbs).toEqual(visible)
    expect(crumbs).toEqual(['Recent work', 'Church camp tees'])
  })

  it('uses the item’s published image as its social card', async () => {
    get.mockResolvedValue(item())
    const metadata = await generateMetadata({ params: { slug: 'church-camp-tees' } })
    expect(metadata.openGraph?.images).toEqual([
      {
        url: 'https://images.example.com/portfolio/i1.jpg',
        alt: 'Stack of printed navy T-shirts',
        width: 1600,
        height: 1200,
      },
    ])
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/portfolio/church-camp-tees`)
  })
})

describe('unavailable portfolio detail', () => {
  it('404s and describes nothing when the feature is off', async () => {
    vi.stubEnv('NEXT_PUBLIC_PORTFOLIO_ENABLED', 'false')
    vi.resetModules()
    const { default: Page } = await import('./[slug]/page')
    await expect(Page({ params: { slug: 'church-camp-tees' } })).rejects.toBe(notFoundError)
  })

  it('404s when the item cannot be read, rather than rendering an empty page', async () => {
    get.mockRejectedValue(new Error('boom'))
    await expect(PortfolioDetailPage({ params: { slug: 'gone' } })).rejects.toBe(notFoundError)
  })

  it('returns empty metadata — no canonical — when the item cannot be read', async () => {
    get.mockRejectedValue(new Error('boom'))
    expect(await generateMetadata({ params: { slug: 'gone' } })).toEqual({})
  })
})
