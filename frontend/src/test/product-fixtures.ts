import type { PrintArea, PrintAreaSizeOption, PrintSize, Product } from '@/types'

/** Shared product-detail fixtures for the Jira 10304 route tests. */

export const PRODUCT_ID = '11111111-1111-1111-1111-111111111111'
export const BLACK_S = 'v-black-s'
export const BLACK_M = 'v-black-m'

export function productFixture(overrides: Partial<Product> = {}): Product {
  return {
    id: PRODUCT_ID,
    name: 'Gildan Heavy Cotton Tee',
    description: 'Mid-weight cotton crew neck, printed in Otahuhu.',
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
      { id: BLACK_S, productId: PRODUCT_ID, sku: 'GIL-BLK-S', color: 'Black', size: 'S', priceAdjustment: 0, stockQuantity: 10, isAvailable: true, sortOrder: 0 },
      { id: BLACK_M, productId: PRODUCT_ID, sku: 'GIL-BLK-M', color: 'Black', size: 'M', priceAdjustment: 0, stockQuantity: 10, isAvailable: true, sortOrder: 1 },
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

export const printAreasFixture = [
  { id: 'area-front', name: 'Front', code: 'FRONT', description: null, basePrice: 0, isActive: true, sortOrder: 0 },
  { id: 'area-back', name: 'Back', code: 'BACK', description: null, basePrice: 0, isActive: true, sortOrder: 1 },
] as unknown as PrintArea[]

export const printSizesFixture = [
  { id: 'size-a4', name: 'A4', description: null, basePrice: 8, isActive: true, sortOrder: 0 },
  { id: 'size-a3', name: 'A3', description: null, basePrice: 12, isActive: true, sortOrder: 1 },
] as unknown as PrintSize[]

export function areaSizeOptionsFixture(areaId: string): PrintAreaSizeOption[] {
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
