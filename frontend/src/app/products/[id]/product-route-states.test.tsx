import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductDetailSkeleton } from './ProductDetailSkeleton'
import ProductDetailError from './error'
import ProductNotFound from './not-found'

/**
 * Jira 10304 — the three route states must be distinguishable: a structural skeleton while loading,
 * a retryable message for a temporary failure, and a genuine 404 for a missing product. The old
 * route had none of these; every failure rendered "Product not found".
 */

describe('loading state', () => {
  it('renders a structural skeleton rather than a spinner-only screen', () => {
    const { container } = render(<ProductDetailSkeleton />)

    // Placeholder blocks stand in for breadcrumb, image frame, title/price card and config cards.
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(container.querySelector('.aspect-square')).not.toBeNull()
    expect(container.querySelectorAll('.card').length).toBeGreaterThanOrEqual(3)
  })

  it('hides decorative placeholders from assistive technology but announces loading', () => {
    render(<ProductDetailSkeleton />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Loading product details')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(document.querySelector('[aria-hidden="true"].animate-pulse')).not.toBeNull()
  })
})

describe('error state', () => {
  it('says the load failed, not that the product is missing', () => {
    render(<ProductDetailError error={new Error('ECONNRESET')} reset={vi.fn()} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('We couldn’t load this product')
    expect(screen.getByText(/temporary problem/i)).toBeInTheDocument()
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/no longer available/i)).not.toBeInTheDocument()
  })

  it('offers a working Retry that re-runs the server render', async () => {
    const user = userEvent.setup()
    const reset = vi.fn()

    render(<ProductDetailError error={new Error('boom')} reset={reset} />)
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('links back to products without forcing the customer to navigate away to retry', () => {
    render(<ProductDetailError error={new Error('boom')} reset={vi.fn()} />)

    expect(screen.getByRole('link', { name: 'Back to Products' })).toHaveAttribute('href', '/products')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('announces the failure and never exposes internal exception detail', () => {
    const error = Object.assign(new Error('Npgsql: connection string secret=hunter2'), {
      digest: 'abc123',
    })

    const { container } = render(<ProductDetailError error={error} reset={vi.fn()} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(container.textContent).not.toContain('hunter2')
    expect(container.textContent).not.toContain('Npgsql')
    expect(container.textContent).not.toContain('abc123')
  })

  it('moves focus to the message so keyboard users are not stranded', () => {
    render(<ProductDetailError error={new Error('boom')} reset={vi.fn()} />)

    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
  })
})

describe('not-found state', () => {
  it('explains the product may no longer be available and links to the catalogue', () => {
    render(<ProductNotFound />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This product isn’t available')
    expect(screen.getByText(/removed from the online catalogue/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse Products' })).toHaveAttribute('href', '/products')
  })

  it('offers no retry affordance, which cannot help a missing product', () => {
    render(<ProductNotFound />)

    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/try again/i)).not.toBeInTheDocument()
  })
})
