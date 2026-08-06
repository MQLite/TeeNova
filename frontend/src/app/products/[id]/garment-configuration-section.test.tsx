import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { productFixture } from '@/test/product-fixtures'
import type { PrintArea, PrintSize, Product } from '@/types'

/**
 * Jira 10304 — the streamed garment configuration island.
 *
 * The section is awaited and its output rendered, which is the same tree the HTTP response carries.
 * This is where the server-rendered product content is proven: the client component receives its
 * initial data as props and produces the markup without a single browser fetch.
 */

const getAreas = vi.fn<(options?: unknown) => Promise<PrintArea[]>>()
const getSizes = vi.fn<(options?: unknown) => Promise<PrintSize[]>>()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/products/11111111-1111-1111-1111-111111111111',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/api/print-config', () => ({
  printConfigApi: {
    getAreas: (options?: unknown) => getAreas(options),
    getSizes: (options?: unknown) => getSizes(options),
    getAreaSizes: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/api/pricing', () => ({
  pricingApi: {
    calculateBatch: vi.fn().mockResolvedValue({ results: [] }),
    calculatePricing: vi.fn(),
  },
}))

vi.mock('@/api/files', () => ({ filesApi: { upload: vi.fn() } }))

// eslint-disable-next-line import/first
import { GarmentConfigurationSection } from './GarmentConfigurationSection'

async function renderSection(overrides: Partial<Product> = {}) {
  return render(await GarmentConfigurationSection({ product: productFixture(overrides) }))
}

beforeEach(() => {
  getAreas.mockReset().mockResolvedValue([])
  getSizes.mockReset().mockResolvedValue([])
  window.sessionStorage.clear()
})

describe('garment configuration section', () => {
  it('renders full product content on the server with no client fetch', async () => {
    await renderSection()

    expect(screen.getByRole('heading', { level: 1, name: 'Gildan Heavy Cotton Tee' })).toBeInTheDocument()
    expect(screen.getByText('tshirt')).toBeInTheDocument()
    expect(screen.getByText('$18.50')).toBeInTheDocument()
    expect(screen.getByText(/Mid-weight cotton crew neck/)).toBeInTheDocument()
    expect(screen.getByText('Sizes and Quantities')).toBeInTheDocument()
  })

  it('reads the global print configuration with the documented revalidation window', async () => {
    await renderSection()

    expect(getAreas).toHaveBeenCalledWith({ revalidate: 300 })
    expect(getSizes).toHaveBeenCalledWith({ revalidate: 300 })
  })

  it('renders the primary product image with colour-specific alt text', async () => {
    await renderSection()

    const image = screen.getByAltText('Gildan Heavy Cotton Tee — Black')
    expect(image).toBeInTheDocument()
    expect(image.getAttribute('src')).toContain('gildan.png')
  })

  it('falls back to the placeholder when the product has no image', async () => {
    const { container } = await renderSection({ images: [] })

    expect(screen.queryByAltText(/Gildan Heavy Cotton Tee/)).not.toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('no longer renders the hard-coded, unverified garment trust claims', async () => {
    await renderSection()

    expect(screen.queryByText('Premium cotton')).not.toBeInTheDocument()
    expect(screen.queryByText('Vivid print')).not.toBeInTheDocument()
    expect(screen.queryByText('Fast ship')).not.toBeInTheDocument()
  })

  it('keeps the backend-authority disclosure on the purchase control', async () => {
    await renderSection()

    expect(
      screen.getByText(/Final order pricing is recalculated by the backend at checkout/),
    ).toBeInTheDocument()
  })

  it('surfaces a print-config failure as a retryable route error, never as "not found"', async () => {
    getAreas.mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(
      GarmentConfigurationSection({ product: productFixture() }),
    ).rejects.toThrow('ECONNREFUSED')
  })
})
