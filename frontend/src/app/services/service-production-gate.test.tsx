import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

/**
 * Jira 10306 — in a production build a Draft or unknown service must be a real 404, with no banner,
 * no shell and no leaked title. Every service currently defined publishes, so the Draft case is
 * exercised by substituting one definition with a Draft copy of itself; `serviceDraftPreviewAllowed`
 * reads NODE_ENV at call time, so production is exercised by stubbing the environment and
 * re-importing the route.
 */

const notFoundError = new Error('NEXT_NOT_FOUND')
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw notFoundError
  },
}))
vi.mock('@/components/services/ServiceProducts', () => ({ ServiceProducts: () => null }))
vi.mock('@/components/services/ServicePortfolio', () => ({ ServicePortfolio: () => null }))

vi.mock('@/content/services/signage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/content/services/signage')>()
  return {
    signageService: {
      ...actual.signageService,
      status: 'draft',
      draftReason: 'Test fixture: signage held back pending owner approval.',
    },
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const routeFor = async (environment: 'production' | 'development') => {
  vi.stubEnv('NODE_ENV', environment)
  const route = await import('./[slug]/page')
  return route.default as (props: { params: { slug: string } }) => JSX.Element
}

describe('production publication gate', () => {
  it('returns 404 for a draft service', async () => {
    const Route = await routeFor('production')
    expect(() => render(<Route params={{ slug: 'signage' }} />)).toThrow(notFoundError)
  })

  it('returns 404 for an unknown service', async () => {
    const Route = await routeFor('production')
    expect(() => render(<Route params={{ slug: 'flag-printing' }} />)).toThrow(notFoundError)
  })

  it('leaks no draft title, summary or section text', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { resolveServiceForRequest, serviceMetadata } = await import(
      '@/lib/service-content/route-helpers'
    )
    expect(resolveServiceForRequest('signage')).toBeUndefined()
    expect(serviceMetadata('signage')).toEqual({})
  })

  it('keeps a draft service out of the index, the generated params and the footer', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { publishedServices } = await import('@/lib/service-content/registry')
    const { publishedServiceParams } = await import('@/lib/service-content/route-helpers')
    expect(publishedServices().map((service) => service.slug)).not.toContain('signage')
    expect(publishedServiceParams().map((param) => param.slug)).not.toContain('signage')
  })

  it('still serves a published service in production, with no draft banner', async () => {
    const Route = await routeFor('production')
    const { container } = render(<Route params={{ slug: 'pvc-banners' }} />)
    expect(container.querySelector('h1')).toHaveTextContent('PVC banners')
    expect(container.querySelector('[aria-label="Draft service preview"]')).toBeNull()
    expect(container.textContent).not.toMatch(/Draft — not published/)
  })
})

describe('draft preview outside production', () => {
  it('renders behind a labelled draft banner', async () => {
    const Route = await routeFor('development')
    const { container } = render(<Route params={{ slug: 'signage' }} />)
    const banner = container.querySelector('[aria-label="Draft service preview"]')
    expect(banner).not.toBeNull()
    expect(banner).toHaveAttribute('role', 'note')
    expect(banner?.textContent).toMatch(/Draft — not published/)
  })

  it('marks the preview noindex, nofollow', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const { serviceMetadata } = await import('@/lib/service-content/route-helpers')
    expect(serviceMetadata('signage').robots).toEqual({ index: false, follow: false })
  })
})
