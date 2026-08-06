import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONFIG_STATE_VERSION,
  clearProductConfiguration,
  configStateKey,
  restoreProductConfiguration,
  saveProductConfiguration,
  type PersistedProductConfiguration,
} from './configuration-persistence'
import type { PrintArea, PrintSize, Product, ProductVariant } from '@/types'

/**
 * Jira 10304 — configuration state must survive a refresh or a recoverable failure, but only after
 * being validated against the product actually on screen, and it must never carry artwork,
 * design notes, prices or anything else sensitive.
 */

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_PRODUCT_ID = '22222222-2222-2222-2222-222222222222'

function variant(id: string, color: string, size: string, isAvailable = true): ProductVariant {
  return {
    id,
    productId: PRODUCT_ID,
    sku: `sku-${id}`,
    color,
    size,
    priceAdjustment: 0,
    stockQuantity: 10,
    isAvailable,
    sortOrder: 0,
  } as unknown as ProductVariant
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: PRODUCT_ID,
    name: 'Classic Tee',
    description: 'A tee.',
    basePrice: 20,
    productType: 'tshirt',
    kind: 'Garment',
    pricingModel: 'GarmentPrint',
    minimumQuantity: 1,
    designUploadRequired: false,
    isActive: true,
    creationTime: '2026-01-01T00:00:00Z',
    printPricingGroupId: null,
    variants: [variant('v-black-s', 'Black', 'S'), variant('v-black-m', 'Black', 'M')],
    images: [
      { id: 'img-1', productId: PRODUCT_ID, url: '/uploads/products/a.png', color: 'Black', isPrimary: true, sortOrder: 0 },
    ],
    priceTiers: [],
    printPriceTiers: [],
    printConfigOptions: [],
    quantityPriceTiers: [],
    fixedSizePriceOptions: [],
    ...overrides,
  } as unknown as Product
}

const printAreas = [{ id: 'area-front', name: 'Front', isActive: true }] as unknown as PrintArea[]
const printSizes = [{ id: 'size-a4', name: 'A4', isActive: true }] as unknown as PrintSize[]

function context(overrides: Partial<Product> = {}) {
  return { product: product(overrides), printAreas, printSizes }
}

const fullState: PersistedProductConfiguration = {
  selectedColors: ['Black'],
  selectedColor: 'Black',
  selectedImageId: 'img-1',
  variantQtys: { 'v-black-s': 5, 'v-black-m': 3 },
  selectedPrintAreas: ['area-front'],
  printSizeByArea: { 'area-front': 'size-a4' },
  mobileStep: 'review',
  openQuantityColor: 'Black',
}

beforeEach(() => {
  window.sessionStorage.clear()
})

describe('product configuration persistence', () => {
  it('round-trips a complete selection', () => {
    saveProductConfiguration(PRODUCT_ID, fullState)

    const restored = restoreProductConfiguration(context())

    expect(restored).not.toBeNull()
    expect(restored!.dropped).toBe(false)
    expect(restored!.state).toEqual(fullState)
  })

  it('scopes storage by product id and contract version', () => {
    saveProductConfiguration(PRODUCT_ID, fullState)

    expect(window.sessionStorage.getItem(configStateKey(PRODUCT_ID))).not.toBeNull()
    expect(configStateKey(PRODUCT_ID)).toContain(`v${CONFIG_STATE_VERSION}`)
    expect(configStateKey(PRODUCT_ID)).not.toBe(configStateKey(OTHER_PRODUCT_ID))
  })

  it('never restores one product’s state into another', () => {
    saveProductConfiguration(PRODUCT_ID, fullState)
    // Same key, but the envelope names a different product (e.g. a hand-edited entry).
    window.sessionStorage.setItem(
      configStateKey(OTHER_PRODUCT_ID),
      JSON.stringify({ version: CONFIG_STATE_VERSION, productId: PRODUCT_ID, ...fullState }),
    )

    const restored = restoreProductConfiguration({
      product: product({ id: OTHER_PRODUCT_ID }),
      printAreas,
      printSizes,
    })

    expect(restored).toBeNull()
  })

  it('ignores an entry written under a previous contract version', () => {
    window.sessionStorage.setItem(
      configStateKey(PRODUCT_ID),
      JSON.stringify({ version: CONFIG_STATE_VERSION + 1, productId: PRODUCT_ID, ...fullState }),
    )

    expect(restoreProductConfiguration(context())).toBeNull()
  })

  it('falls back safely when the persisted mobile step is invalid', () => {
    saveProductConfiguration(PRODUCT_ID, fullState)
    const parsed = JSON.parse(window.sessionStorage.getItem(configStateKey(PRODUCT_ID))!)
    parsed.mobileStep = 'payment'
    window.sessionStorage.setItem(configStateKey(PRODUCT_ID), JSON.stringify(parsed))

    const restored = restoreProductConfiguration(context())
    expect(restored?.state.mobileStep).toBe('colour')
    expect(restored?.dropped).toBe(true)
  })

  it('does not restore Review when the saved configuration is now incomplete', () => {
    saveProductConfiguration(PRODUCT_ID, {
      ...fullState,
      variantQtys: {},
      mobileStep: 'review',
    })

    const restored = restoreProductConfiguration(context())
    expect(restored?.state.mobileStep).toBe('quantities')
    expect(restored?.dropped).toBe(true)
  })

  it('recovers safely from invalid stored JSON and discards the entry', () => {
    window.sessionStorage.setItem(configStateKey(PRODUCT_ID), '{not json at all')

    expect(restoreProductConfiguration(context())).toBeNull()
    expect(window.sessionStorage.getItem(configStateKey(PRODUCT_ID))).toBeNull()
  })

  it('drops selections for variants that no longer exist or are unavailable', () => {
    saveProductConfiguration(PRODUCT_ID, fullState)

    const restored = restoreProductConfiguration(
      context({
        // "M" was withdrawn entirely, "S" was marked unavailable.
        variants: [variant('v-black-s', 'Black', 'S', false)],
      }),
    )

    expect(restored).not.toBeNull()
    expect(restored!.dropped).toBe(true)
    expect(restored!.state.variantQtys).toEqual({})
    // The rest of the configuration still comes back.
    expect(restored!.state.selectedPrintAreas).toEqual(['area-front'])
  })

  it('drops a colour, image, print area or print size that is no longer offered', () => {
    saveProductConfiguration(PRODUCT_ID, {
      ...fullState,
      selectedColor: 'Sunburst',
      selectedImageId: 'img-removed',
      selectedPrintAreas: ['area-front', 'area-retired'],
      printSizeByArea: { 'area-front': 'size-retired' },
    })

    const restored = restoreProductConfiguration(context())

    expect(restored!.dropped).toBe(true)
    expect(restored!.state.selectedColor).toBeNull()
    expect(restored!.state.selectedImageId).toBeNull()
    expect(restored!.state.selectedPrintAreas).toEqual(['area-front'])
    expect(restored!.state.printSizeByArea).toEqual({})
  })

  it('rejects non-positive, non-integer and out-of-range quantities', () => {
    saveProductConfiguration(PRODUCT_ID, {
      ...fullState,
      variantQtys: { 'v-black-s': 0, 'v-black-m': 4_000 } as Record<string, number>,
    })

    const restored = restoreProductConfiguration(context())

    expect(restored!.state.variantQtys['v-black-s']).toBeUndefined()
    expect(restored!.state.variantQtys['v-black-m']).toBe(999)
  })

  it('returns null when nothing survived validation', () => {
    saveProductConfiguration(PRODUCT_ID, {
      selectedColors: [],
      selectedColor: 'Sunburst',
      selectedImageId: null,
      variantQtys: { 'v-gone': 2 },
      selectedPrintAreas: ['area-retired'],
      printSizeByArea: {},
      mobileStep: 'colour',
      openQuantityColor: null,
    })

    expect(restoreProductConfiguration(context())).toBeNull()
  })

  it('removes the entry rather than storing an empty configuration', () => {
    saveProductConfiguration(PRODUCT_ID, fullState)
    saveProductConfiguration(PRODUCT_ID, {
      selectedColors: [],
      selectedColor: null,
      selectedImageId: null,
      variantQtys: {},
      selectedPrintAreas: [],
      printSizeByArea: {},
      mobileStep: 'colour',
      openQuantityColor: null,
    })

    expect(window.sessionStorage.getItem(configStateKey(PRODUCT_ID))).toBeNull()
  })

  it('persists no artwork, design note, price or personal field', () => {
    saveProductConfiguration(PRODUCT_ID, fullState)

    const raw = window.sessionStorage.getItem(configStateKey(PRODUCT_ID)) ?? ''

    for (const forbidden of [
      'uploadedAsset',
      'assetId',
      'fileUrl',
      'designNote',
      'unitPrice',
      'lineTotal',
      'email',
    ]) {
      expect(raw).not.toContain(forbidden)
    }
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual([
      'mobileStep',
      'openQuantityColor',
      'printSizeByArea',
      'productId',
      'selectedColor',
      'selectedColors',
      'selectedImageId',
      'selectedPrintAreas',
      'variantQtys',
      'version',
    ])
  })

  it('clears an entry on request', () => {
    saveProductConfiguration(PRODUCT_ID, fullState)
    clearProductConfiguration(PRODUCT_ID)

    expect(restoreProductConfiguration(context())).toBeNull()
  })

  it('never throws when storage is unavailable', () => {
    const failing = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => saveProductConfiguration(PRODUCT_ID, fullState)).not.toThrow()

    failing.mockRestore()
  })
})
