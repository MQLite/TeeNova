import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

/**
 * Jira 10303 — in a production build every draft slug must be a real 404, with no banner, no shell
 * and no partial wording. `draftPreviewAllowed()` reads NODE_ENV at call time, so the production
 * behaviour is exercised by stubbing the environment and re-importing the route.
 */

const notFoundError = new Error('NEXT_NOT_FOUND')
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw notFoundError
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const productionRoute = async (group: 'help' | 'policies') => {
  vi.stubEnv('NODE_ENV', 'production')
  const route = group === 'help'
    ? await import('./[slug]/page')
    : await import('../policies/[slug]/page')
  return route.default as (props: { params: { slug: string } }) => JSX.Element
}

const DRAFT_POLICY_SLUGS = ['privacy', 'returns', 'payment-terms', 'terms']
const DRAFT_HELP_SLUGS = ['turnaround', 'delivery-and-pickup', 'size-guide', 'garment-care']

describe('production publication gate', () => {
  it.each(DRAFT_POLICY_SLUGS)('returns 404 for the draft policy /policies/%s', async (slug) => {
    const Route = await productionRoute('policies')
    expect(() => render(<Route params={{ slug }} />)).toThrow(notFoundError)
  })

  it.each(DRAFT_HELP_SLUGS)('returns 404 for the draft help page /help/%s', async (slug) => {
    const Route = await productionRoute('help')
    expect(() => render(<Route params={{ slug }} />)).toThrow(notFoundError)
  })

  it('still serves the published help pages in production', async () => {
    const Route = await productionRoute('help')
    const { container } = render(<Route params={{ slug: 'artwork-requirements' }} />)
    expect(container.querySelector('h1')).toHaveTextContent('Artwork and file requirements')
    expect(container.textContent).not.toMatch(/Draft — not published/)
  })

  it('renders no draft banner anywhere in production', async () => {
    const Route = await productionRoute('help')
    const { container } = render(<Route params={{ slug: 'faq' }} />)
    expect(container.querySelector('[aria-label="Draft content preview"]')).toBeNull()
  })
})
