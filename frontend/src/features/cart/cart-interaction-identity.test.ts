import { beforeEach, describe, expect, it } from 'vitest'
import { useCartStore } from './cart-store'
import { buildCartProductGroups } from './cart-grouping'
import { buildOrderItemPayloads } from '@/features/checkout/order-item-payload'
import type { CartItem } from '@/types'

/**
 * End-to-end identity check for the grouped cart (Jira 10102): the projection is derived from the real
 * store, and the store mutations are driven exactly as the grouped UI drives them — by `cartItemKey`
 * only. Proves that grouping never causes a mutation to hit the wrong line, and that the persisted
 * cart and the checkout payload are untouched by the presentation change.
 */

const TEE = '11111111-1111-1111-1111-111111111111'
const TEE_OTHER = '22222222-2222-2222-2222-222222222222'

function line(cartItemKey: string, overrides: Partial<CartItem> = {}): CartItem {
  return {
    cartItemKey,
    productId: TEE,
    productVariantId: 'variant-black-m',
    productName: 'Staple Tee',
    variantLabel: 'Black / M',
    color: 'Black',
    size: 'M',
    unitPrice: 30,
    quantity: 2,
    printPricingGroupId: null,
    prints: [
      { printAreaId: 'a-front', printAreaName: 'Front', printSizeId: 's-a3', printSizeName: 'A3' },
    ],
    ...overrides,
  }
}

/** Same product, same colour, same size — separated only by their print configuration. */
const frontOnly = line('front-only', { quantity: 2 })
const frontAndBack = line('front-and-back', {
  quantity: 3,
  prints: [
    { printAreaId: 'a-front', printAreaName: 'Front', printSizeId: 's-a3', printSizeName: 'A3' },
    { printAreaId: 'a-back', printAreaName: 'Back', printSizeId: 's-a4', printSizeName: 'A4' },
  ],
})
const otherProduct = line('other-product', {
  productId: TEE_OTHER,
  productName: 'Staple Tee', // identical name, different product id
  quantity: 1,
})

function seed(items: CartItem[]) {
  useCartStore.setState({ items: structuredClone(items) })
}

function currentItems() {
  return useCartStore.getState().items
}

function groups() {
  return buildCartProductGroups(currentItems())
}

/** Mirrors the page handlers exactly: resolve by cartItemKey, then delegate to the store. */
function increase(cartItemKey: string) {
  const item = currentItems().find((i) => i.cartItemKey === cartItemKey)
  if (!item) return
  useCartStore.getState().updateQuantity(cartItemKey, item.quantity + 1)
}

function decrease(cartItemKey: string) {
  const item = currentItems().find((i) => i.cartItemKey === cartItemKey)
  if (!item) return
  useCartStore.getState().updateQuantity(cartItemKey, item.quantity - 1)
}

describe('grouped cart interaction identity', () => {
  beforeEach(() => {
    seed([frontOnly, frontAndBack, otherProduct])
  })

  it('groups by product identity, not by name', () => {
    const projected = groups()

    expect(projected).toHaveLength(2)
    expect(projected.map((g) => g.productId).sort()).toEqual([TEE, TEE_OTHER])
    expect(projected.every((g) => g.productName === 'Staple Tee')).toBe(true)
  })

  it('increases only the targeted row when two rows share colour and size', () => {
    increase('front-and-back')

    const items = currentItems()
    expect(items.find((i) => i.cartItemKey === 'front-and-back')?.quantity).toBe(4)
    expect(items.find((i) => i.cartItemKey === 'front-only')?.quantity).toBe(2)
    expect(items).toHaveLength(3)
  })

  it('decreases only the targeted row when two rows share colour and size', () => {
    decrease('front-only')

    const items = currentItems()
    expect(items.find((i) => i.cartItemKey === 'front-only')?.quantity).toBe(1)
    expect(items.find((i) => i.cartItemKey === 'front-and-back')?.quantity).toBe(3)
  })

  it('removes the line when the quantity is decreased past the minimum, leaving its neighbour', () => {
    decrease('front-only')
    decrease('front-only') // 1 → 0 → removal, per the existing store rule

    const items = currentItems()
    expect(items.map((i) => i.cartItemKey)).toEqual(['front-and-back', 'other-product'])
  })

  it('deletes one row from a multi-row product group without touching adjacent rows', () => {
    useCartStore.getState().removeItem('front-only')

    const projected = groups()
    const teeGroup = projected.find((g) => g.productId === TEE)
    expect(teeGroup?.rows.map((r) => r.cartItemKey)).toEqual(['front-and-back'])
    expect(teeGroup?.totalQuantity).toBe(3)
    expect(projected).toHaveLength(2)
  })

  it('removes the product group entirely once its final row is deleted', () => {
    useCartStore.getState().removeItem('front-only')
    useCartStore.getState().removeItem('front-and-back')

    const projected = groups()
    expect(projected).toHaveLength(1)
    expect(projected[0].productId).toBe(TEE_OTHER)
    expect(projected.some((g) => g.productId === TEE)).toBe(false)
  })

  it('reconciles quantities against the store after every mutation', () => {
    increase('front-and-back')
    decrease('front-only')
    useCartStore.getState().removeItem('other-product')

    const projected = groups()
    const storeTotal = currentItems().reduce((sum, i) => sum + i.quantity, 0)
    const groupedTotal = projected.reduce((sum, g) => sum + g.totalQuantity, 0)

    expect(groupedTotal).toBe(storeTotal)
    for (const group of projected) {
      expect(group.rows.reduce((sum, r) => sum + r.quantity, 0)).toBe(group.totalQuantity)
    }
  })

  it('leaves the persisted line count, order and checkout payload unchanged by grouping', () => {
    const before = buildOrderItemPayloads(currentItems())
    const keysBefore = currentItems().map((i) => i.cartItemKey)

    groups() // deriving the presentation model must have no side effects

    expect(currentItems().map((i) => i.cartItemKey)).toEqual(keysBefore)
    expect(buildOrderItemPayloads(currentItems())).toEqual(before)
    expect(before).toHaveLength(3)
  })
})
