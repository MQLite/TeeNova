import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PRODUCT_ID, productFixture } from '@/test/product-fixtures'
import { ApiError } from '@/lib/api-client'
import { DEVELOPMENT_FALLBACK_ORIGIN } from '@/lib/seo/site-url'
import type { Product } from '@/types'

/**
 * Jira 10308 — structured data on the product and portfolio detail routes.
 *
 * The SQL-backed catalogue is not reachable from this environment, so the runtime matrix records
 * live product evidence as Blocked. These tests close that gap at the level that matters: they run
 * the real server components against a controlled catalogue response and read the JSON-LD out of the
 * rendered document, so the parity between what is drawn and what is described is asserted, not
 * assumed.
 */

const getProduct = vi.fn<(id: string, options?: unknown) => Promise<Product>>()
const notFoundError = new Error('NEXT_NOT_FOUND')

vi.mock('@/api/catalog', () => ({ catalogApi: { getProduct: (...args: [string, unknown?]) => getProduct(...args) } }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw notFoundError
  },
}))
// The garment island is an async server component the test renderer cannot resolve; its own
// behaviour is covered in garment-configuration-section.test.tsx.
vi.mock('./GarmentConfigurationSection', () => ({ GarmentConfigurationSection: () => null }))

import ProductDetailPage, { generateMetadata } from './page'

const ORIGIN = DEVELOPMENT_FALLBACK_ORIGIN

function graphsOf(container: HTMLElement): Record<string, unknown>[] {
  return [...container.querySelectorAll('script[type="application/ld+json"]')].flatMap((script) => {
    const parsed = JSON.parse(script.textContent ?? '{}') as { '@graph'?: Record<string, unknown>[] }
    return parsed['@graph'] ?? []
  })
}

const nodeOfType = (graph: Record<string, unknown>[], type: string) =>
  graph.find((node) => node['@type'] === type)

const renderProduct = async (product: Product) => {
  getProduct.mockResolvedValue(product)
  return render(await ProductDetailPage({ params: Promise.resolve({ id: product.id }) }))
}

beforeEach(() => {
  getProduct.mockReset()
})

describe('product page structured data', () => {
  it('describes the product the page renders, with a matching breadcrumb', async () => {
    const { container } = await renderProduct(productFixture())
    const graph = graphsOf(container)

    const product = nodeOfType(graph, 'Product') as { name: string; url: string; description: string }
    expect(product.name).toBe('Gildan Heavy Cotton Tee')
    expect(product.url).toBe(`${ORIGIN}/products/${PRODUCT_ID}`)

    const crumbs = (nodeOfType(graph, 'BreadcrumbList') as { itemListElement: { name: string }[] })
      .itemListElement.map((entry) => entry.name)
    const visible = [...container.querySelectorAll('nav[aria-label="Breadcrumb"] a, nav[aria-label="Breadcrumb"] span')]
      .map((node) => node.textContent?.trim() ?? '')
      .filter((text) => text !== '' && text !== '/')
    expect(crumbs).toEqual(visible)
    expect(crumbs).toEqual(['Home', 'Products', 'Gildan Heavy Cotton Tee'])
  })

  it('emits no offer for a garment, whose visible price is a reference figure', async () => {
    const { container } = await renderProduct(productFixture())
    expect(nodeOfType(graphsOf(container), 'Product')).not.toHaveProperty('offers')
  })

  it('emits an offer for a badge from the same tiers the page displays', async () => {
    const badge = productFixture({
      kind: 'Badge',
      quantityPriceTiers: [
        { id: 't1', productId: PRODUCT_ID, minQuantity: 10, unitPrice: 3.5, isActive: true, sortOrder: 0 },
        { id: 't2', productId: PRODUCT_ID, minQuantity: 100, unitPrice: 1.8, isActive: true, sortOrder: 1 },
      ],
    } as never)
    const { container } = await renderProduct(badge)
    const offers = (nodeOfType(graphsOf(container), 'Product') as { offers: Record<string, unknown> }).offers
    expect(offers).toMatchObject({ '@type': 'AggregateOffer', priceCurrency: 'NZD', lowPrice: 1.8, highPrice: 3.5 })
    // The same numbers are on the page.
    expect(container.textContent).toContain('1.80')
    expect(container.textContent).toContain('3.50')
  })

  it('emits no breadcrumb on the branch that renders none', async () => {
    const banner = productFixture({ kind: 'Banner', pricingModel: 'AreaBased' } as never)
    const { container } = await renderProduct(banner)
    expect(container.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull()
    expect(nodeOfType(graphsOf(container), 'BreadcrumbList')).toBeUndefined()
    // The product itself is still described — it is a real, active, public product page.
    expect(nodeOfType(graphsOf(container), 'Product')).toBeDefined()
  })

  it('escapes hostile catalogue text rather than letting it close the script element', async () => {
    const { container } = await renderProduct(
      productFixture({ name: 'Tee </script><img src=x onerror=alert(1)>' }),
    )
    const script = container.querySelector('script[type="application/ld+json"]')!
    expect(script.textContent).not.toContain('</script')
    expect(container.querySelector('img[onerror]')).toBeNull()
    const product = nodeOfType(graphsOf(container), 'Product') as { name: string }
    expect(product.name).toBe('Tee </script><img src=x onerror=alert(1)>')
  })

  it('emits no product schema when the product is missing', async () => {
    getProduct.mockRejectedValue(new ApiError(404, 'gone'))
    await expect(ProductDetailPage({ params: Promise.resolve({ id: PRODUCT_ID }) })).rejects.toBe(
      notFoundError,
    )
  })

  it('emits no product schema and no canonical when the backend fails temporarily', async () => {
    const failure = new ApiError(500, 'boom')
    getProduct.mockRejectedValue(failure)

    // The route rethrows to the retryable error boundary; nothing is rendered, so nothing is claimed.
    await expect(ProductDetailPage({ params: Promise.resolve({ id: PRODUCT_ID }) })).rejects.toBe(failure)

    const metadata = await generateMetadata({ params: Promise.resolve({ id: PRODUCT_ID }) })
    expect(metadata.robots).toEqual({ index: false, follow: true })
    expect(metadata.alternates).toBeUndefined()
    // No "this product does not exist" signal — that decision belongs to the 404 branch alone.
    expect(JSON.stringify(metadata)).not.toMatch(/not found|does not exist|unavailable/i)
  })
})
