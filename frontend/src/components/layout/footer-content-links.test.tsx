import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Footer } from './Footer'
import { allPublicContentDocuments, isPublished, publicContentHref } from '@/lib/public-content/registry'

/**
 * Jira 10303 — the footer may only ever link to published help and policy documents, and the
 * unverified payment-method badges it used to carry are gone.
 */

describe('footer help and policy links', () => {
  it('lists every published document and nothing else', () => {
    render(<Footer />)
    const nav = screen.getByRole('navigation', { name: 'Help and policies' })
    const hrefs = within(nav)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))

    const expected = allPublicContentDocuments.filter(isPublished).map(publicContentHref)
    expect(hrefs).toEqual(expected)
    expect(hrefs).toContain('/help/artwork-requirements')
    expect(hrefs).toContain('/help/faq')
  })

  it('links to no draft route anywhere in the footer', () => {
    const { container } = render(<Footer />)
    const draftHrefs = allPublicContentDocuments
      .filter((document) => !isPublished(document))
      .map(publicContentHref)

    const allHrefs = [...container.querySelectorAll('a')].map((link) => link.getAttribute('href'))
    for (const draftHref of draftHrefs) expect(allHrefs).not.toContain(draftHref)
  })

  it('contains no dead or placeholder link targets', () => {
    const { container } = render(<Footer />)
    for (const link of container.querySelectorAll('a')) {
      const href = link.getAttribute('href')
      expect(href).toBeTruthy()
      expect(href).not.toBe('#')
      expect(href).not.toBe('')
    }
  })

  it('no longer advertises an unverified set of accepted payment methods', () => {
    render(<Footer />)
    expect(screen.queryByText('Bank Transfer')).toBeNull()
    expect(screen.queryByText('Cash')).toBeNull()
    expect(screen.queryByText('Eftpos')).toBeNull()
  })

  it('preserves the existing quote and contact links', () => {
    render(<Footer />)
    expect(screen.getAllByText('Request a Quote').length).toBeGreaterThan(0)
    expect(screen.getByText('Contact Us')).toBeInTheDocument()
  })
})
