import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApiError } from '@/lib/api-client'
import { DEVELOPMENT_FALLBACK_ORIGIN } from '@/lib/seo/site-url'
import { PRODUCT_ID, productFixture } from '@/test/product-fixtures'
import type { Product } from '@/types'

/**
 * Jira 10304 — server-rendered product shell.
 *
 * These tests execute the real server component (an async function) and render what it returns, so
 * they assert what the HTTP response carries: the product is resolved *before* anything renders (so
 * the 404/200 decision precedes the first flush), a genuine 404 is separated from a temporary
 * failure, the structural skeleton stands in while the configuration island streams, and the
 * product-kind dispatch that feeds cart/checkout is unchanged.
 *
 * The garment island itself is stubbed here — React 18's client renderer cannot resolve an async
 * component — and is covered for real in garment-configuration-section.test.tsx.
 */

const getProduct = vi.fn<(id: string, options?: unknown) => Promise<Product>>()

vi.mock('@/api/catalog', () => ({
  catalogApi: { getProduct: (id: string, options?: unknown) => getProduct(id, options) },
}))

// Stubbed as a component that never resolves, so the Suspense fallback is what renders.
vi.mock('./GarmentConfigurationSection', () => ({
  GarmentConfigurationSection: () => {
    throw new Promise<void>(() => {})
  },
}))

// eslint-disable-next-line import/first
import ProductDetailPage, { generateMetadata } from './page'

function renderPage(id = PRODUCT_ID) {
  return ProductDetailPage({ params: Promise.resolve({ id }) })
}

beforeEach(() => {
  getProduct.mockReset()
  window.sessionStorage.clear()
})

describe('product detail server shell', () => {
  it('resolves the product before rendering, so the 404/200 decision precedes the first flush', async () => {
    getProduct.mockResolvedValue(productFixture())

    render(await renderPage())

    expect(getProduct).toHaveBeenCalledWith(PRODUCT_ID, { revalidate: 60 })
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByText('Gildan Heavy Cotton Tee')).toBeInTheDocument()
    expect(screen.queryByText('Product not found')).not.toBeInTheDocument()
  })

  it('marks the current product in the breadcrumb and links back to the catalogue', async () => {
    getProduct.mockResolvedValue(productFixture())

    render(await renderPage())

    expect(screen.getByRole('link', { name: 'Products' })).toHaveAttribute('href', '/products')
    expect(screen.getByText('Gildan Heavy Cotton Tee')).toHaveAttribute('aria-current', 'page')
  })

  it('shows the structural skeleton — not a bare spinner — while the island streams', async () => {
    getProduct.mockResolvedValue(productFixture())

    const { container } = render(await renderPage())

    expect(screen.getByRole('status')).toHaveTextContent('Loading product details')
    expect(container.querySelector('[aria-hidden="true"].animate-pulse')).not.toBeNull()
    expect(container.querySelector('.aspect-square')).not.toBeNull()
  })

  it('answers a genuine 404 with the not-found response, not a retry screen', async () => {
    getProduct.mockRejectedValue(new ApiError(404, 'Not found'))

    await expect(renderPage()).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
  })

  it('propagates a temporary failure to the retryable error boundary', async () => {
    getProduct.mockRejectedValue(new ApiError(503, 'Service unavailable'))

    await expect(renderPage()).rejects.toBeInstanceOf(ApiError)
  })

  it('propagates a network failure rather than reporting a missing product', async () => {
    getProduct.mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(renderPage()).rejects.toThrow('ECONNREFUSED')
  })

  it('dispatches a Badge product to the badge detail view', async () => {
    getProduct.mockResolvedValue(
      productFixture({
        kind: 'Badge',
        pricingModel: 'QuantityTierUnit',
        name: 'Round Pin Badge',
        quantityPriceTiers: [
          { id: 't1', productId: PRODUCT_ID, minQuantity: 10, unitPrice: 2, isActive: true, sortOrder: 0 },
        ] as never,
      }),
    )

    render(await renderPage())

    expect(screen.getByRole('heading', { level: 1, name: 'Round Pin Badge' })).toBeInTheDocument()
  })

  it('dispatches a CustomQuoteOnly banner to the enquiry view', async () => {
    getProduct.mockResolvedValue(
      productFixture({ kind: 'Banner', pricingModel: 'CustomQuoteOnly', name: 'Custom PVC Banner' }),
    )

    render(await renderPage())

    expect(screen.getByRole('heading', { level: 1, name: 'Custom PVC Banner' })).toBeInTheDocument()
  })

  it('dispatches a FixedSize banner to the priced banner view', async () => {
    getProduct.mockResolvedValue(
      productFixture({
        kind: 'Banner',
        pricingModel: 'FixedSize',
        name: 'Pull-up Banner',
        fixedSizePriceOptions: [
          {
            id: 'opt-1',
            productId: PRODUCT_ID,
            label: 'Pull-up 850×2000 mm',
            width: 850,
            height: 2000,
            unit: 'Mm',
            unitPrice: 180,
            isActive: true,
            sortOrder: 0,
          },
        ] as never,
      }),
    )

    render(await renderPage())

    expect(screen.getByRole('heading', { level: 1, name: 'Pull-up Banner' })).toBeInTheDocument()
    expect(screen.getByText('Pull-up 850×2000 mm')).toBeInTheDocument()
  })

  it('shows the contact-for-quote fallback for an AreaBased banner', async () => {
    getProduct.mockResolvedValue(
      productFixture({ kind: 'Banner', pricingModel: 'AreaBased', name: 'Mesh Banner' }),
    )

    render(await renderPage())

    expect(screen.getByText(/isn’t available to price online yet/)).toBeInTheDocument()
  })

  it('keeps the garment configuration island for kinds outside the dedicated views', async () => {
    getProduct.mockResolvedValue(productFixture({ kind: 'Other', name: 'Bespoke Print Job' }))

    render(await renderPage())

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading product details')
  })
})

describe('product detail metadata', () => {
  it('produces a product-specific title, description and canonical path', async () => {
    getProduct.mockResolvedValue(productFixture())

    const metadata = await generateMetadata({ params: Promise.resolve({ id: PRODUCT_ID }) })

    expect(metadata.title).toBe('Gildan Heavy Cotton Tee')
    expect(metadata.description).toBe('Mid-weight cotton crew neck, printed in Otahuhu.')
    // Absolute since Jira 10308, and still the GUID path — the catalogue exposes no public slug.
    expect(metadata.alternates?.canonical).toBe(
      `${DEVELOPMENT_FALLBACK_ORIGIN}/products/${PRODUCT_ID}`,
    )
    expect(metadata.openGraph?.title).toBe('Gildan Heavy Cotton Tee | Otahuhu Printing')
    expect(metadata.robots).toEqual({ index: true, follow: true })
  })

  it('truncates a long description rather than emitting it whole', async () => {
    getProduct.mockResolvedValue(productFixture({ description: 'x'.repeat(400) }))

    const metadata = await generateMetadata({ params: Promise.resolve({ id: PRODUCT_ID }) })

    expect(metadata.description!.length).toBeLessThanOrEqual(155)
    expect(metadata.description!.endsWith('…')).toBe(true)
  })

  it('falls back to safe copy when the product has no description', async () => {
    getProduct.mockResolvedValue(productFixture({ description: '   ' }))

    const metadata = await generateMetadata({ params: Promise.resolve({ id: PRODUCT_ID }) })

    expect(metadata.description).toContain('Gildan Heavy Cotton Tee')
    expect(metadata.description).toContain('Otahuhu')
  })

  it('uses the cached catalogue read so it costs no extra backend request', async () => {
    getProduct.mockResolvedValue(productFixture())

    await generateMetadata({ params: Promise.resolve({ id: PRODUCT_ID }) })

    expect(getProduct).toHaveBeenCalledWith(PRODUCT_ID, { revalidate: 60 })
  })

  it('never breaks the page when the product cannot be read, and stays out of the index', async () => {
    getProduct.mockRejectedValue(new ApiError(500, 'boom'))

    const metadata = await generateMetadata({ params: Promise.resolve({ id: PRODUCT_ID }) })

    // Generic, canonical-free and noindex (Jira 10308): a backend blip must not produce indexable
    // metadata for a page whose body is about to render the retryable error boundary, and it must
    // not assert that the product is missing either.
    expect(metadata).toEqual({ title: 'Product', robots: { index: false, follow: true } })
    expect(metadata.alternates).toBeUndefined()
  })
})
