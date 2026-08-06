import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCartStore } from '@/features/cart/cart-store'
import { resetPrintAreaSizesCache } from '@/features/products/print-area-sizes-cache'
import { saveProductConfiguration } from '@/features/products/configuration-persistence'
import type {
  BatchPriceCalculationItem,
  BatchPriceCalculationResponse,
  PriceCalculationResponse,
  PrintArea,
  PrintAreaSizeOption,
  PrintSize,
  Product,
} from '@/types'

/**
 * Jira 10304 — behaviour of the extracted client island.
 *
 * The real configurator, the real cart store and the real persistence/cache modules are exercised;
 * only the HTTP layer is mocked. The point of these tests is that the rendering refactor changed
 * *how data arrives* and nothing about what reaches the cart.
 */

const getProduct = vi.fn()
const getAreas = vi.fn()
const getSizes = vi.fn()
const getAreaSizes = vi.fn<(areaId: string) => Promise<PrintAreaSizeOption[]>>()
const calculateBatch = vi.fn<
  (items: BatchPriceCalculationItem[], signal?: AbortSignal) => Promise<BatchPriceCalculationResponse>
>()
const calculatePricing = vi.fn()
const navigation = vi.hoisted(() => ({ search: '', push: vi.fn(), replace: vi.fn() }))
let mobileViewport = false
const mediaListeners = new Set<() => void>()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  usePathname: () => `/products/${PRODUCT_ID}`,
  useSearchParams: () => new URLSearchParams(navigation.search),
}))

vi.mock('@/api/catalog', () => ({ catalogApi: { getProduct: (...a: unknown[]) => getProduct(...a) } }))

vi.mock('@/api/print-config', () => ({
  printConfigApi: {
    getAreas: (...a: unknown[]) => getAreas(...a),
    getSizes: (...a: unknown[]) => getSizes(...a),
    getAreaSizes: (areaId: string) => getAreaSizes(areaId),
  },
}))

vi.mock('@/api/pricing', () => ({
  pricingApi: {
    calculateBatch: (items: BatchPriceCalculationItem[], signal?: AbortSignal) =>
      calculateBatch(items, signal),
    calculatePricing: (...a: unknown[]) => calculatePricing(...a),
  },
}))

vi.mock('@/api/files', () => ({ filesApi: { upload: vi.fn() } }))

// eslint-disable-next-line import/first
import { ProductConfiguratorClient } from './ProductConfiguratorClient'

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111'
const BLACK_S = 'v-black-s'
const BLACK_M = 'v-black-m'

const printAreas = [
  { id: 'area-front', name: 'Front', code: 'FRONT', basePrice: 0, isActive: true, sortOrder: 0 },
  { id: 'area-back', name: 'Back', code: 'BACK', basePrice: 0, isActive: true, sortOrder: 1 },
] as unknown as PrintArea[]

const printSizes = [
  { id: 'size-a4', name: 'A4', basePrice: 8, isActive: true, sortOrder: 0 },
  { id: 'size-a3', name: 'A3', basePrice: 12, isActive: true, sortOrder: 1 },
] as unknown as PrintSize[]

function areaSizeOptions(areaId: string): PrintAreaSizeOption[] {
  return [
    {
      id: `${areaId}-a4`,
      printAreaId: areaId,
      printSizeId: 'size-a4',
      printSize: { id: 'size-a4', name: 'A4', basePrice: 8, isActive: true, sortOrder: 0 },
      isActive: true,
      sortOrder: 0,
    },
  ] as unknown as PrintAreaSizeOption[]
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: PRODUCT_ID,
    name: 'Gildan Heavy Cotton Tee',
    description: 'Mid-weight cotton crew neck.',
    basePrice: 18.5,
    productType: 'tshirt',
    kind: 'Garment',
    pricingModel: 'GarmentPrint',
    minimumQuantity: 1,
    designUploadRequired: false,
    isActive: true,
    creationTime: '2026-01-01T00:00:00Z',
    printPricingGroupId: 'group-tees',
    variants: [
      { id: BLACK_S, productId: PRODUCT_ID, sku: 'S', color: 'Black', size: 'S', priceAdjustment: 0, stockQuantity: 9, isAvailable: true, sortOrder: 0 },
      { id: BLACK_M, productId: PRODUCT_ID, sku: 'M', color: 'Black', size: 'M', priceAdjustment: 0, stockQuantity: 9, isAvailable: true, sortOrder: 1 },
    ],
    images: [
      { id: 'img-1', productId: PRODUCT_ID, url: '/uploads/products/gildan.png', color: 'Black', isPrimary: true, sortOrder: 0 },
    ],
    priceTiers: [],
    printPriceTiers: [],
    printConfigOptions: [],
    quantityPriceTiers: [],
    fixedSizePriceOptions: [],
    ...overrides,
  } as unknown as Product
}

function quote(unitPrice: number, quantity: number): PriceCalculationResponse {
  return {
    productBasePrice: 18.5,
    variantAdjustment: 0,
    printAddOns: [],
    garmentUnitPrice: 18.5,
    printUnitPrice: unitPrice - 18.5,
    unitPrice,
    quantity,
    lineTotal: unitPrice * quantity,
    currency: 'NZD',
    pricingMode: 'Additive',
    appliedTierMinQuantity: null,
    appliedTierUnitPrice: null,
    nextTierMinQuantity: null,
    nextTierUnitPrice: null,
    includedStandardPrintAmount: 0,
  }
}

function renderConfigurator(overrides: Partial<Product> = {}) {
  return render(
    <ProductConfiguratorClient
      product={product(overrides)}
      printAreas={printAreas}
      printSizes={printSizes}
    />,
  )
}

/** Types a quantity into one cell of the colour × size matrix. */
async function enterQuantity(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = screen.getByLabelText(label)
  await user.clear(input)
  await user.type(input, value)
}

/**
 * Waits until authoritative pricing has arrived for every selected line. Uses the live-region copy,
 * which is rendered only when `pricingIsComplete` — the same gate add-to-cart enforces.
 */
async function waitForPricingComplete() {
  await waitFor(() => expect(screen.getByText(/Price preview updated\./)).toBeInTheDocument(), {
    timeout: 4000,
  })
}

beforeEach(() => {
  mobileViewport = false
  mediaListeners.clear()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      get matches() { return mobileViewport },
      media: '(max-width: 1023px)',
      addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
    })),
  })
  navigation.search = ''
  navigation.push.mockReset()
  navigation.replace.mockReset()
  navigation.push.mockImplementation((url: string) => { navigation.search = url.split('?')[1] ?? '' })
  navigation.replace.mockImplementation((url: string) => { navigation.search = url.split('?')[1] ?? '' })
  getProduct.mockReset()
  getAreas.mockReset()
  getSizes.mockReset()
  getAreaSizes.mockReset().mockImplementation(async (areaId: string) => areaSizeOptions(areaId))
  calculateBatch.mockReset()
  calculatePricing.mockReset()
  resetPrintAreaSizesCache()
  window.sessionStorage.clear()
  useCartStore.setState({ items: [] })
})

afterEach(() => {
  useCartStore.setState({ items: [] })
})

describe('initial data', () => {
  it('renders product content immediately and repeats none of the three initial requests', async () => {
    renderConfigurator()

    expect(screen.getByRole('heading', { level: 1, name: 'Gildan Heavy Cotton Tee' })).toBeInTheDocument()

    // Give any stray mount effect a chance to fire.
    await waitFor(() => expect(screen.getByText('Sizes and Quantities')).toBeInTheDocument())

    expect(getProduct).not.toHaveBeenCalled()
    expect(getAreas).not.toHaveBeenCalled()
    expect(getSizes).not.toHaveBeenCalled()
  })

  it('never falls back to the single-quote endpoint', async () => {
    const user = userEvent.setup()
    calculateBatch.mockResolvedValue({ results: [{ correlationKey: BLACK_S, quote: quote(18.5, 3) }] })

    renderConfigurator()
    await enterQuantity(user, 'Quantity for Black S', '3')

    await waitFor(() => expect(calculateBatch).toHaveBeenCalled(), { timeout: 3000 })
    expect(calculatePricing).not.toHaveBeenCalled()
  })
})

describe('per-area print size loading', () => {
  it('requests an area once and reuses the cached result on reselect', async () => {
    const user = userEvent.setup()
    renderConfigurator()

    await user.click(screen.getByRole('button', { name: /Front/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /A4/ })).toBeInTheDocument())

    // Deselect, then select again — the second selection must not refetch.
    await user.click(screen.getByRole('button', { name: /Front/ }))
    await user.click(screen.getByRole('button', { name: /Front/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /A4/ })).toBeInTheDocument())

    expect(getAreaSizes).toHaveBeenCalledTimes(1)
  })

  it('issues one request per distinct area', async () => {
    const user = userEvent.setup()
    renderConfigurator()

    await user.click(screen.getByRole('button', { name: /Front/ }))
    await user.click(screen.getByRole('button', { name: /Back/ }))

    await waitFor(() => expect(getAreaSizes).toHaveBeenCalledTimes(2))
    expect(getAreaSizes.mock.calls.map((call) => call[0]).sort()).toEqual(['area-back', 'area-front'])
  })
})

describe('batch pricing', () => {
  it('prices every selected line in a single batch request with the shared tier quantity', async () => {
    const user = userEvent.setup()
    calculateBatch.mockResolvedValue({
      results: [
        { correlationKey: BLACK_S, quote: quote(18.5, 3) },
        { correlationKey: BLACK_M, quote: quote(18.5, 2) },
      ],
    })

    renderConfigurator()
    await enterQuantity(user, 'Quantity for Black S', '3')
    await enterQuantity(user, 'Quantity for Black M', '2')

    await waitFor(() => expect(calculateBatch).toHaveBeenCalled(), { timeout: 3000 })

    const [items] = calculateBatch.mock.calls[calculateBatch.mock.calls.length - 1]
    expect(items).toHaveLength(2)
    expect(items.map((item) => item.correlationKey)).toEqual([BLACK_S, BLACK_M])
    expect(items.every((item) => item.request.tierQuantity === 5)).toBe(true)
  })

  it('keeps a partial failure on its own line and blocks add-to-cart', async () => {
    const user = userEvent.setup()
    calculateBatch.mockResolvedValue({
      results: [
        { correlationKey: BLACK_S, quote: quote(18.5, 3) },
        { correlationKey: BLACK_M, quote: null, errorCode: 'TeeNova:Pricing:VariantUnavailable' },
      ],
    })

    renderConfigurator()
    await enterQuantity(user, 'Quantity for Black S', '3')
    await enterQuantity(user, 'Quantity for Black M', '2')

    // The panel's aggregate message (existing behaviour) reports the partial failure; the friendly
    // per-line copy for the error code is asserted in product-pricing-batch.test.ts.
    await waitFor(
      () =>
        expect(
          screen.getAllByText(/Pricing is unavailable for one or more selected variant lines/).length,
        ).toBeGreaterThan(0),
      { timeout: 4000 },
    )

    await user.click(screen.getByRole('button', { name: /Add 5 Items to Cart/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Wait for pricing preview/)
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('discards a slow earlier response so it cannot overwrite a newer quantity', async () => {
    const user = userEvent.setup()
    let releaseFirst: ((value: BatchPriceCalculationResponse) => void) | undefined

    calculateBatch
      .mockImplementationOnce(
        () => new Promise<BatchPriceCalculationResponse>((resolve) => { releaseFirst = resolve }),
      )
      .mockImplementation(async () => ({
        results: [{ correlationKey: BLACK_S, quote: quote(18.5, 9) }],
      }))

    renderConfigurator()
    await enterQuantity(user, 'Quantity for Black S', '3')
    await waitFor(() => expect(calculateBatch).toHaveBeenCalledTimes(1), { timeout: 3000 })

    // New selection supersedes the in-flight request.
    await enterQuantity(user, 'Quantity for Black S', '9')
    await waitFor(() => expect(calculateBatch).toHaveBeenCalledTimes(2), { timeout: 3000 })
    await waitFor(() => expect(screen.getByText('9 items')).toBeInTheDocument())

    // The stale response lands late and must be ignored.
    releaseFirst!({ results: [{ correlationKey: BLACK_S, quote: quote(18.5, 3) }] })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Add 9 Items to Cart/ })).toBeEnabled(),
      { timeout: 3000 },
    )
    expect(screen.getByText('9 items')).toBeInTheDocument()
  })

  it('reports a total failure as temporary and does not price locally', async () => {
    const user = userEvent.setup()
    calculateBatch.mockRejectedValue(new Error('network down'))

    renderConfigurator()
    await enterQuantity(user, 'Quantity for Black S', '3')

    await waitFor(
      () =>
        expect(screen.getAllByText(/Pricing preview is temporarily unavailable/).length).toBeGreaterThan(0),
      { timeout: 4000 },
    )
    expect(useCartStore.getState().items).toHaveLength(0)
  })
})

describe('add to cart', () => {
  it('blocks with no quantity entered', async () => {
    const user = userEvent.setup()
    renderConfigurator()

    await user.click(screen.getByRole('button', { name: /Select quantities above/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Enter at least one quantity/)
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('blocks when a selected print area has no print size chosen', async () => {
    const user = userEvent.setup()
    calculateBatch.mockResolvedValue({ results: [{ correlationKey: BLACK_S, quote: quote(18.5, 3) }] })

    renderConfigurator()
    await enterQuantity(user, 'Quantity for Black S', '3')
    await user.click(screen.getByRole('button', { name: /Front/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /A4/ })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Add 3 Items to Cart/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Select a print size/)
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('writes the unchanged cart payload, key and snapshots for a printed line', async () => {
    const user = userEvent.setup()
    calculateBatch.mockResolvedValue({
      results: [{ correlationKey: BLACK_S, quote: quote(26.5, 3) }],
    })

    renderConfigurator()
    await enterQuantity(user, 'Quantity for Black S', '3')
    await user.click(screen.getByRole('button', { name: /Front/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /A4/ })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /A4/ }))

    await waitForPricingComplete()
    await user.click(screen.getByRole('button', { name: /Add 3 Items to Cart/ }))

    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(1))

    expect(useCartStore.getState().items[0]).toEqual({
      cartItemKey: `${BLACK_S}__area-front:size-a4`,
      productId: PRODUCT_ID,
      productVariantId: BLACK_S,
      productName: 'Gildan Heavy Cotton Tee',
      variantLabel: 'Black / S',
      color: 'Black',
      size: 'S',
      unitPrice: 26.5,
      quantity: 3,
      printPricingGroupId: 'group-tees',
      prints: [
        {
          printAreaId: 'area-front',
          printAreaName: 'Front',
          printSizeId: 'size-a4',
          printSizeName: 'A4',
          uploadedAssetId: undefined,
          uploadedAssetUrl: undefined,
          designNote: undefined,
        },
      ],
    })
  })

  it('uses the blank print signature when no print area is selected', async () => {
    const user = userEvent.setup()
    calculateBatch.mockResolvedValue({ results: [{ correlationKey: BLACK_S, quote: quote(18.5, 2) }] })

    renderConfigurator()
    await enterQuantity(user, 'Quantity for Black S', '2')

    await waitForPricingComplete()
    await user.click(screen.getByRole('button', { name: /Add 2 Items to Cart/ }))

    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(1))
    expect(useCartStore.getState().items[0].cartItemKey).toBe(`${BLACK_S}__blank`)
    expect(useCartStore.getState().items[0].prints).toEqual([])
  })
})

describe('configuration persistence', () => {
  it('restores a previous selection on remount and tells the customer', async () => {
    saveProductConfiguration(PRODUCT_ID, {
      selectedColors: ['Black'],
      selectedColor: 'Black',
      selectedImageId: null,
      variantQtys: { [BLACK_S]: 7 },
      selectedPrintAreas: [],
      printSizeByArea: {},
      mobileStep: 'quantities',
      openQuantityColor: 'Black',
    })
    calculateBatch.mockResolvedValue({ results: [{ correlationKey: BLACK_S, quote: quote(18.5, 7) }] })

    renderConfigurator()

    await waitFor(() => expect(screen.getByLabelText('Quantity for Black S')).toHaveValue(7))
    expect(screen.getByText(/restored your previous selection/i)).toBeInTheDocument()
  })

  it('drops selections that are no longer available and says so', async () => {
    saveProductConfiguration(PRODUCT_ID, {
      selectedColors: ['Black'],
      selectedColor: 'Black',
      selectedImageId: null,
      variantQtys: { [BLACK_S]: 7, 'v-withdrawn': 4 },
      selectedPrintAreas: [],
      printSizeByArea: {},
      mobileStep: 'quantities',
      openQuantityColor: 'Black',
    })
    calculateBatch.mockResolvedValue({ results: [{ correlationKey: BLACK_S, quote: quote(18.5, 7) }] })

    renderConfigurator()

    await waitFor(() => expect(screen.getByLabelText('Quantity for Black S')).toHaveValue(7))
    expect(screen.getByText(/no longer available and were removed/i)).toBeInTheDocument()
  })

  it('starts clean when the stored entry is corrupt', async () => {
    window.sessionStorage.setItem(`teenova:product-config:v2:${PRODUCT_ID}`, '{{{')

    renderConfigurator()

    await waitFor(() => expect(screen.getByLabelText('Quantity for Black S')).toHaveValue(null))
    expect(screen.queryByText(/restored your previous selection/i)).not.toBeInTheDocument()
  })

  it('mirrors a new selection into session storage without artwork or prices', async () => {
    const user = userEvent.setup()
    calculateBatch.mockResolvedValue({ results: [{ correlationKey: BLACK_S, quote: quote(18.5, 4) }] })

    renderConfigurator()
    await enterQuantity(user, 'Quantity for Black S', '4')

    await waitFor(() => {
      const raw = window.sessionStorage.getItem(`teenova:product-config:v2:${PRODUCT_ID}`)
      expect(raw).toContain(BLACK_S)
    })

    const raw = window.sessionStorage.getItem(`teenova:product-config:v2:${PRODUCT_ID}`)!
    expect(raw).not.toContain('unitPrice')
    expect(raw).not.toContain('uploadedAsset')
  })
})

describe('accessibility affordances', () => {
  it('exposes a polite price status region and labelled quantity inputs', async () => {
    renderConfigurator()

    // The breadcrumb itself is owned by the server shell (asserted in product-detail-page.test.tsx).
    const statuses = screen.getAllByRole('status')
    expect(statuses.some((node) => node.getAttribute('aria-live') === 'polite')).toBe(true)
    expect(screen.getByLabelText('Quantity for Black S')).toBeInTheDocument()
  })

  it('announces the completed price preview', async () => {
    const user = userEvent.setup()
    calculateBatch.mockResolvedValue({ results: [{ correlationKey: BLACK_S, quote: quote(18.5, 2) }] })

    renderConfigurator()
    await enterQuantity(user, 'Quantity for Black S', '2')

    await waitFor(
      () => expect(screen.getByText(/Price preview updated\. 2 items, estimated total \$37\.00\./)).toBeInTheDocument(),
      { timeout: 3000 },
    )
  })
})

describe('mobile five-step configurator', () => {
  function useMobileViewport(search = '') {
    mobileViewport = true
    navigation.search = search
  }

  it('renders one mobile presentation with a focused, semantic default step', async () => {
    useMobileViewport()
    renderConfigurator()

    const mobile = await screen.findByTestId('mobile-configurator')
    expect(mobile).toBeInTheDocument()
    expect(screen.queryByTestId('desktop-configurator')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Colour' })).toHaveFocus()
    expect(screen.getByRole('button', { name: /Colour, current step/ })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByTestId('mobile-sticky-bar')).toHaveTextContent('Enter quantities')
    expect(navigation.replace).toHaveBeenCalledWith(expect.stringContaining('step=colour'), { scroll: false })
  })

  it('guides through all five steps and keeps authoritative batch pricing', async () => {
    useMobileViewport('step=colour')
    calculateBatch.mockImplementation(async (items: BatchPriceCalculationItem[]) => ({
      results: items.map((item) => ({
        correlationKey: item.correlationKey,
        quote: quote(18.5, item.request.quantity),
      })),
    }))
    const user = userEvent.setup()
    renderConfigurator()

    await screen.findByTestId('mobile-configurator')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Print position and size' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Sizes and quantities' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Increase quantity for Black, size S' }))
    expect(screen.getByLabelText('Quantity for Black, size S')).toHaveValue('1')
    await waitFor(() => expect(calculateBatch).toHaveBeenCalled(), { timeout: 3000 })

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Artwork' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'View price' }))
    expect(await screen.findByRole('heading', { name: 'Review price' })).toHaveFocus()
    expect(screen.getByTestId('mobile-sticky-bar')).toHaveTextContent('$18.50')
    expect(calculatePricing).not.toHaveBeenCalled()
  })

  it('supports direct quantity typing, rejects invalid text, and enforces the maximum', async () => {
    useMobileViewport('step=quantities')
    saveProductConfiguration(PRODUCT_ID, {
      selectedColors: ['Black'], selectedColor: 'Black', selectedImageId: null,
      variantQtys: {}, selectedPrintAreas: [], printSizeByArea: {},
      mobileStep: 'quantities', openQuantityColor: 'Black',
    })
    const user = userEvent.setup()
    renderConfigurator()
    const input = await screen.findByLabelText('Quantity for Black, size S')

    await user.type(input, 'abc')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/whole number from 0 to 999/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid quantities/)

    await user.clear(input)
    await user.type(input, '1000')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    await user.clear(input)
    await user.type(input, '12')
    expect(input).toHaveAttribute('aria-invalid', 'false')
  })

  it('supports multiple selected colours without losing another colour quantity', async () => {
    useMobileViewport('step=colour')
    const user = userEvent.setup()
    renderConfigurator({
      variants: [
        ...product().variants,
        { id: 'v-red-s', sku: 'RED-S', color: 'Red', size: 'S', priceAdjustment: 0, stockQuantity: 5, isAvailable: true, inventoryStatus: 'InStock', lowStockThreshold: null, inventoryNote: null, inventoryUpdatedAt: null, inventoryUpdatedBy: null },
      ],
      images: [
        ...product().images,
        { id: 'img-red', url: '/uploads/products/red.png', color: 'Red', isPrimary: false, sortOrder: 1 },
      ],
    })

    const red = await screen.findByRole('button', { name: 'Red' })
    await user.click(red)
    expect(red).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Black' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await user.click(screen.getByRole('button', { name: 'Increase quantity for Black, size S' }))
    await user.click(screen.getByRole('button', { name: /Red 0 items/ }))
    await user.click(screen.getByRole('button', { name: 'Increase quantity for Red, size S' }))
    expect(screen.getByText('Total quantity:').parentElement).toHaveTextContent('2')

    await user.click(screen.getByRole('button', { name: /Black 1 items/ }))
    expect(screen.getByLabelText('Quantity for Black, size S')).toHaveValue('1')
  })

  it('preserves state when the active presentation changes at the breakpoint', async () => {
    useMobileViewport('step=quantities')
    saveProductConfiguration(PRODUCT_ID, {
      selectedColors: ['Black'], selectedColor: 'Black', selectedImageId: null,
      variantQtys: { [BLACK_S]: 4 }, selectedPrintAreas: [], printSizeByArea: {},
      mobileStep: 'quantities', openQuantityColor: 'Black',
    })
    calculateBatch.mockResolvedValue({ results: [{ correlationKey: BLACK_S, quote: quote(18.5, 4) }] })
    renderConfigurator()
    expect(await screen.findByLabelText('Quantity for Black, size S')).toHaveValue('4')

    mobileViewport = false
    mediaListeners.forEach((listener) => listener())
    expect(await screen.findByTestId('desktop-configurator')).toBeInTheDocument()
    expect(screen.getByLabelText('Quantity for Black S')).toHaveValue(4)
    expect(screen.queryByTestId('mobile-configurator')).not.toBeInTheDocument()
  })

  it('responds to Back and Forward query changes without resetting configuration', async () => {
    useMobileViewport('step=artwork')
    saveProductConfiguration(PRODUCT_ID, {
      selectedColors: ['Black'], selectedColor: 'Black', selectedImageId: null,
      variantQtys: { [BLACK_S]: 3 }, selectedPrintAreas: [], printSizeByArea: {},
      mobileStep: 'artwork', openQuantityColor: 'Black',
    })
    calculateBatch.mockResolvedValue({ results: [{ correlationKey: BLACK_S, quote: quote(18.5, 3) }] })
    const view = renderConfigurator()
    expect(await screen.findByRole('heading', { name: 'Artwork' })).toBeInTheDocument()

    navigation.search = 'step=quantities'
    view.rerender(<ProductConfiguratorClient product={product()} printAreas={printAreas} printSizes={printSizes} />)
    expect(await screen.findByRole('heading', { name: 'Sizes and quantities' })).toBeInTheDocument()
    expect(screen.getByLabelText('Quantity for Black, size S')).toHaveValue('3')

    navigation.search = 'step=artwork'
    view.rerender(<ProductConfiguratorClient product={product()} printAreas={printAreas} printSizes={printSizes} />)
    expect(await screen.findByRole('heading', { name: 'Artwork' })).toBeInTheDocument()
  })

  it('corrects invalid and unreachable URL steps with replace', async () => {
    useMobileViewport('step=not-a-step')
    const { rerender } = renderConfigurator()
    await screen.findByRole('heading', { name: 'Colour' })
    expect(navigation.replace).toHaveBeenCalledWith(expect.stringContaining('step=colour'), { scroll: false })

    navigation.replace.mockClear()
    navigation.search = 'step=review'
    rerender(<ProductConfiguratorClient product={product()} printAreas={printAreas} printSizes={printSizes} />)
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(expect.stringContaining('step=quantities'), { scroll: false }))
  })
})
