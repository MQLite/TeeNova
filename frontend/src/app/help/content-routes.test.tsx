import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import HelpContentPage, { generateMetadata as helpMetadata, generateStaticParams as helpParams } from './[slug]/page'
import PolicyContentPage, {
  generateMetadata as policyMetadata,
  generateStaticParams as policyParams,
} from '../policies/[slug]/page'
import { DEVELOPMENT_FALLBACK_ORIGIN } from '@/lib/seo/site-url'

/**
 * Jira 10303 — route behaviour.
 *
 * `notFound()` throws in Next.js, so "returns a real 404" is asserted by the route throwing rather
 * than rendering. Because these tests run outside a production build, draft preview is active; the
 * production behaviour is covered separately in `content-production-gate.test.tsx`.
 */

const notFoundError = new Error('NEXT_NOT_FOUND')
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw notFoundError
  },
}))

describe('generated route params', () => {
  it('pre-generates published help slugs only', () => {
    expect(helpParams()).toEqual([{ slug: 'artwork-requirements' }, { slug: 'faq' }])
  })

  it('pre-generates no policy slugs while every policy is draft', () => {
    expect(policyParams()).toEqual([])
  })
})

describe('published help page', () => {
  it('renders the document with one h1 and ordered headings', () => {
    const { container } = render(<HelpContentPage params={{ slug: 'artwork-requirements' }} />)

    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent('Artwork and file requirements')

    // Every other heading is an h2; no level is skipped and no h3 appears without an h2 parent.
    const levels = [...container.querySelectorAll('h1, h2, h3, h4')].map((node) =>
      Number(node.tagName.slice(1)),
    )
    expect(Math.max(...levels)).toBeLessThanOrEqual(2)
    expect(levels[0]).toBe(1)
  })

  it('renders a breadcrumb navigation landmark', () => {
    render(<HelpContentPage params={{ slug: 'artwork-requirements' }} />)
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(breadcrumb).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(within(breadcrumb).getByText('Artwork and file requirements')).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('shows a readable last-reviewed date backed by a machine-readable time element', () => {
    const { container } = render(<HelpContentPage params={{ slug: 'artwork-requirements' }} />)
    const time = container.querySelector('time')
    expect(time).toHaveAttribute('dateTime', '2026-08-05')
    expect(time?.textContent).toMatch(/5 August 2026/)
  })

  it('offers an in-page table of contents whose anchors resolve to focusable sections', () => {
    const { container } = render(<HelpContentPage params={{ slug: 'artwork-requirements' }} />)
    const toc = screen.getByRole('navigation', { name: 'On this page' })
    const anchors = [...within(toc).getAllByRole('link')]
    expect(anchors.length).toBeGreaterThan(1)
    for (const anchor of anchors) {
      const id = anchor.getAttribute('href')!.slice(1)
      const target = container.querySelector(`#${id}`)
      expect(target).not.toBeNull()
      expect(target).toHaveAttribute('tabindex', '-1')
    }
  })

  it('renders tables with a caption and column scope', () => {
    const { container } = render(<HelpContentPage params={{ slug: 'artwork-requirements' }} />)
    const table = container.querySelector('table')!
    expect(table.querySelector('caption')?.textContent).toBe('Current upload limits by upload type')
    for (const header of table.querySelectorAll('th')) {
      expect(header).toHaveAttribute('scope', 'col')
    }
  })

  it('never renders draft sections', () => {
    render(<HelpContentPage params={{ slug: 'artwork-requirements' }} />)
    expect(screen.queryByRole('heading', { name: 'Resolution, colour and bleed' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Proofs, artwork fixes and colour matching' })).toBeNull()
  })

  it('renders published FAQ questions and withholds draft answers', () => {
    render(<HelpContentPage params={{ slug: 'faq' }} />)
    expect(screen.getByRole('heading', { name: 'Is a quote an order?' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'What file types are accepted?' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Do you deliver?' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'How long does a job take?' })).toBeNull()
  })

  it('links only to published related documents, with descriptive link text', () => {
    render(<HelpContentPage params={{ slug: 'faq' }} />)
    const related = screen.getByRole('navigation', { name: 'Related' })
    const links = within(related).getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/help/artwork-requirements')
    expect(links[0]).toHaveTextContent('Artwork and file requirements')
    expect(links[0].textContent).not.toMatch(/^(here|click here|read more)$/i)
  })
})

describe('unknown slugs', () => {
  it('is a real 404 for an unknown help slug', () => {
    expect(() => render(<HelpContentPage params={{ slug: 'not-a-page' }} />)).toThrow(notFoundError)
  })

  it('is a real 404 for an unknown policy slug', () => {
    expect(() => render(<PolicyContentPage params={{ slug: 'refunds' }} />)).toThrow(notFoundError)
  })
})

describe('draft preview outside production', () => {
  it('renders a labelled draft banner and no unapproved policy wording', () => {
    render(<PolicyContentPage params={{ slug: 'privacy' }} />)
    const banner = screen.getByRole('note', { name: 'Draft content preview' })
    expect(banner).toHaveTextContent('Draft — not published')
    expect(banner).toHaveTextContent(/returns a 404 and is absent from site navigation/)
    // No privacy section is approved, so the preview shows the shell only.
    expect(screen.queryByRole('heading', { name: 'Your rights, legal basis and complaints' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'How long information is kept' })).toBeNull()
  })

  it('marks a draft preview non-indexable', () => {
    expect(policyMetadata({ params: { slug: 'privacy' } }).robots).toEqual({ index: false, follow: false })
  })
})

describe('metadata', () => {
  it('gives each published document a unique title, description and canonical', () => {
    const artwork = helpMetadata({ params: { slug: 'artwork-requirements' } })
    const faq = helpMetadata({ params: { slug: 'faq' } })

    expect(artwork.title).toBe('Artwork and file requirements')
    expect(faq.title).toBe('Frequently asked questions')
    expect(artwork.title).not.toBe(faq.title)
    expect(artwork.description).not.toBe(faq.description)
    // Canonicals became absolute in Jira 10308 — a relative canonical with no `metadataBase`
    // resolves against whichever host answered the request. Outside production the origin is the
    // documented development fallback; in production it is the configured public origin, and when
    // that is missing the canonical is omitted entirely rather than guessed.
    expect(artwork.alternates?.canonical).toBe(
      `${DEVELOPMENT_FALLBACK_ORIGIN}/help/artwork-requirements`,
    )
    expect(faq.alternates?.canonical).toBe(`${DEVELOPMENT_FALLBACK_ORIGIN}/help/faq`)
    // A published document is explicitly indexable; only a draft preview is noindex.
    expect(artwork.robots).toEqual({ index: true, follow: true })
  })

  it('returns empty metadata for an unknown slug rather than inventing one', () => {
    expect(helpMetadata({ params: { slug: 'not-a-page' } })).toEqual({})
  })
})
