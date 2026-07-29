import { describe, expect, it } from 'vitest'
import {
  MISSING_VALUE_LABEL,
  UNNAMED_PRODUCT_LABEL,
  buildCartProductGroups,
  garmentSizeRank,
  totalGroupedQuantity,
  type CartRowPricingLike,
} from './cart-grouping'
import { buildOrderItemPayloads } from '@/features/checkout/order-item-payload'
import type { CartItem, CartItemPrint } from '@/types'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TEE_A = '11111111-1111-1111-1111-111111111111'
const TEE_B = '22222222-2222-2222-2222-222222222222'
const BADGE = '33333333-3333-3333-3333-333333333333'
const BANNER = '44444444-4444-4444-4444-444444444444'

function print(area: string, size: string, extra: Partial<CartItemPrint> = {}): CartItemPrint {
  return {
    printAreaId: `area-${area}`,
    printAreaName: area,
    printSizeId: `size-${size}`,
    printSizeName: size,
    ...extra,
  }
}

function garment(overrides: Partial<CartItem> & { cartItemKey: string }): CartItem {
  return {
    productId: TEE_A,
    productVariantId: 'variant-1',
    productName: 'Staple Tee',
    variantLabel: 'Black / M',
    color: 'Black',
    size: 'M',
    unitPrice: 30,
    quantity: 1,
    printPricingGroupId: null,
    prints: [print('Front', 'A3')],
    ...overrides,
  }
}

function badge(overrides: Partial<CartItem> & { cartItemKey: string }): CartItem {
  return {
    productId: BADGE,
    productName: 'Round Badge',
    unitPrice: 2,
    quantity: 10,
    kind: 'Badge',
    pricingModel: 'QuantityTierUnit',
    uploadedAssetId: 'asset-1',
    uploadedAssetUrl: '/uploads/designs/badge.png',
    designNote: 'Club logo',
    prints: [],
    ...overrides,
  }
}

function banner(overrides: Partial<CartItem> & { cartItemKey: string }): CartItem {
  return {
    productId: BANNER,
    productName: 'Pull-up Banner',
    unitPrice: 180,
    quantity: 2,
    kind: 'Banner',
    pricingModel: 'FixedSize',
    printPricingGroupId: null,
    uploadedAssetId: 'asset-2',
    uploadedAssetUrl: '/uploads/designs/banner.png',
    bannerDetail: {
      sizeMode: 'Preset',
      sizePresetId: 'preset-1',
      sizeLabel: '850 × 2000 mm',
      material: 'PullUp',
      finishingEyelets: false,
      finishingHemming: false,
      finishingPolePocket: false,
      standIncluded: true,
      standReplacementOnly: false,
    },
    prints: [],
    ...overrides,
  }
}

function pricing(unitPrice: number, quantity: number): CartRowPricingLike {
  return { unitPrice, lineTotal: unitPrice * quantity }
}

// ── Grouping ─────────────────────────────────────────────────────────────────

describe('buildCartProductGroups — grouping', () => {
  it('returns no groups for an empty cart', () => {
    expect(buildCartProductGroups([])).toEqual([])
  })

  it('projects one product with one line into one group and one row', () => {
    const groups = buildCartProductGroups([garment({ cartItemKey: 'k1', quantity: 3 })])

    expect(groups).toHaveLength(1)
    expect(groups[0].productId).toBe(TEE_A)
    expect(groups[0].productName).toBe('Staple Tee')
    expect(groups[0].kind).toBe('Garment')
    expect(groups[0].pricingModel).toBe('GarmentPrint')
    expect(groups[0].totalQuantity).toBe(3)
    expect(groups[0].rows.map((r) => r.cartItemKey)).toEqual(['k1'])
  })

  it('keeps multiple colours of one product in a single group as separate rows', () => {
    const groups = buildCartProductGroups([
      garment({ cartItemKey: 'white', color: 'White', variantLabel: 'White / M' }),
      garment({ cartItemKey: 'black', color: 'Black', variantLabel: 'Black / M' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].rows.map((r) => r.colour)).toEqual(['Black', 'White'])
  })

  it('keeps multiple sizes of one product in a single group as separate rows', () => {
    const groups = buildCartProductGroups([
      garment({ cartItemKey: 'l', size: 'L', variantLabel: 'Black / L' }),
      garment({ cartItemKey: 's', size: 'S', variantLabel: 'Black / S' }),
      garment({ cartItemKey: 'm', size: 'M', variantLabel: 'Black / M' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].rows.map((r) => r.size)).toEqual(['S', 'M', 'L'])
  })

  it('separates different products', () => {
    const groups = buildCartProductGroups([
      garment({ cartItemKey: 'a' }),
      garment({ cartItemKey: 'b', productId: TEE_B, productName: 'Heavy Tee' }),
    ])

    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.productId)).toEqual([TEE_B, TEE_A]) // "Heavy Tee" < "Staple Tee"
  })

  it('never merges different product ids that share the same product name', () => {
    const groups = buildCartProductGroups([
      garment({ cartItemKey: 'a', productId: TEE_A, productName: 'Staple Tee' }),
      garment({ cartItemKey: 'b', productId: TEE_B, productName: 'Staple Tee' }),
    ])

    expect(groups).toHaveLength(2)
    expect(new Set(groups.map((g) => g.productId))).toEqual(new Set([TEE_A, TEE_B]))
    expect(groups.every((g) => g.rows.length === 1)).toBe(true)
  })

  it('keeps same product + colour + size as separate rows when cartItemKey differs', () => {
    const groups = buildCartProductGroups([
      garment({ cartItemKey: 'front-only', quantity: 2, prints: [print('Front', 'A3')] }),
      garment({
        cartItemKey: 'front-and-back',
        quantity: 3,
        prints: [print('Front', 'A3'), print('Back', 'A4')],
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].rows).toHaveLength(2)
    expect(groups[0].rows.map((r) => r.cartItemKey).sort()).toEqual(['front-and-back', 'front-only'])
    expect(groups[0].rows.map((r) => r.quantity).reduce((a, b) => a + b, 0)).toBe(5)
    // The distinguishing production detail is exposed, not hidden behind colour/size.
    expect(groups[0].rows.map((r) => r.detailLabel).sort()).toEqual([
      'Front A3',
      'Front A3 + Back A4',
    ])
  })

  it('keeps the same variant with different print signatures separate', () => {
    const groups = buildCartProductGroups([
      garment({ cartItemKey: 'v1__front', prints: [print('Front', 'A3')] }),
      garment({ cartItemKey: 'v1__back', prints: [print('Back', 'A3')] }),
    ])

    expect(groups[0].rows).toHaveLength(2)
    expect(groups[0].rows.map((r) => r.detailLabel)).toEqual(['Back A3', 'Front A3'])
  })
})

// ── Missing data and legacy lines ────────────────────────────────────────────

describe('buildCartProductGroups — fallbacks', () => {
  it('reports a missing colour as null (rendered as the controlled fallback)', () => {
    const groups = buildCartProductGroups([
      garment({ cartItemKey: 'k1', color: undefined, variantLabel: undefined }),
    ])

    expect(groups[0].rows[0].colour).toBeNull()
    expect(MISSING_VALUE_LABEL).toBe('—')
  })

  it('reports a missing size as null', () => {
    const groups = buildCartProductGroups([
      garment({ cartItemKey: 'k1', size: undefined, variantLabel: undefined }),
    ])

    expect(groups[0].rows[0].size).toBeNull()
  })

  it('recovers colour and size from a legacy variantLabel when discrete fields are absent', () => {
    const groups = buildCartProductGroups([
      garment({
        cartItemKey: 'legacy',
        color: undefined,
        size: undefined,
        variantLabel: 'Navy / White / XL',
      }),
    ])

    // Split on the LAST " / " so colours containing a slash stay intact.
    expect(groups[0].rows[0].colour).toBe('Navy / White')
    expect(groups[0].rows[0].size).toBe('XL')
  })

  it('falls back to a controlled label for a blank product name', () => {
    const groups = buildCartProductGroups([garment({ cartItemKey: 'k1', productName: '   ' })])

    expect(groups[0].productName).toBe(UNNAMED_PRODUCT_LABEL)
  })

  it('treats a legacy line without kind/pricingModel as a garment line', () => {
    const legacy = garment({ cartItemKey: 'legacy' })
    delete (legacy as Partial<CartItem>).kind
    delete (legacy as Partial<CartItem>).pricingModel

    const groups = buildCartProductGroups([legacy])

    expect(groups[0].kind).toBe('Garment')
    expect(groups[0].pricingModel).toBe('GarmentPrint')
    expect(groups[0].groupKey).toBe(`${TEE_A}|Garment|GarmentPrint`)
  })

  it('does not merge the same product id across different kinds', () => {
    const groups = buildCartProductGroups([
      garment({ cartItemKey: 'g' }),
      garment({ cartItemKey: 'b', kind: 'Badge', pricingModel: 'QuantityTierUnit' }),
    ])

    expect(groups).toHaveLength(2)
  })
})

// ── Non-garment kinds ────────────────────────────────────────────────────────

describe('buildCartProductGroups — non-garment kinds', () => {
  it('projects a Badge line without apparel fields', () => {
    const groups = buildCartProductGroups([badge({ cartItemKey: 'badge-1' })])

    expect(groups[0].kind).toBe('Badge')
    expect(groups[0].rows[0].colour).toBeNull()
    expect(groups[0].rows[0].size).toBeNull()
    expect(groups[0].rows[0].detailLabel).toBe('Club logo')
    expect(groups[0].totalQuantity).toBe(10)
  })

  it('projects a FixedSize Banner line with its configured size as the detail label', () => {
    const groups = buildCartProductGroups([banner({ cartItemKey: 'banner-1' })])

    expect(groups[0].kind).toBe('Banner')
    expect(groups[0].pricingModel).toBe('FixedSize')
    expect(groups[0].rows[0].colour).toBeNull()
    expect(groups[0].rows[0].detailLabel).toBe('850 × 2000 mm')
  })

  it('orders groups garment → badge → banner, then by name, then by product id', () => {
    const groups = buildCartProductGroups([
      banner({ cartItemKey: 'banner-1' }),
      badge({ cartItemKey: 'badge-1' }),
      garment({ cartItemKey: 'tee-b', productId: TEE_B, productName: 'Heavy Tee' }),
      garment({ cartItemKey: 'tee-a' }),
    ])

    expect(groups.map((g) => g.kind)).toEqual(['Garment', 'Garment', 'Badge', 'Banner'])
    expect(groups.slice(0, 2).map((g) => g.productName)).toEqual(['Heavy Tee', 'Staple Tee'])
  })
})

// ── Ordering ─────────────────────────────────────────────────────────────────

describe('ordering', () => {
  it('ranks apparel sizes in the canonical sequence, numeric sizes after, missing last', () => {
    expect(garmentSizeRank('XS')).toBeLessThan(garmentSizeRank('S'))
    expect(garmentSizeRank('S')).toBeLessThan(garmentSizeRank('M'))
    expect(garmentSizeRank('M')).toBeLessThan(garmentSizeRank('L'))
    expect(garmentSizeRank('L')).toBeLessThan(garmentSizeRank('XL'))
    expect(garmentSizeRank('XL')).toBeLessThan(garmentSizeRank('2XL'))
    expect(garmentSizeRank('2XL')).toBe(garmentSizeRank('XXL'))
    expect(garmentSizeRank('XXXL')).toBeLessThan(garmentSizeRank('8'))
    expect(garmentSizeRank('8')).toBeLessThan(garmentSizeRank('10'))
    expect(garmentSizeRank('10')).toBeLessThan(garmentSizeRank('One Size'))
    expect(garmentSizeRank('One Size')).toBeLessThan(garmentSizeRank(null))
    expect(garmentSizeRank(undefined)).toBe(garmentSizeRank(''))
  })

  it('sorts rows by colour, then size rank, then detail, with missing values last', () => {
    const groups = buildCartProductGroups([
      garment({ cartItemKey: 'w-l', color: 'White', size: 'L' }),
      garment({ cartItemKey: 'none', color: undefined, size: undefined, variantLabel: undefined }),
      garment({ cartItemKey: 'b-xl', color: 'Black', size: 'XL' }),
      garment({ cartItemKey: 'b-s', color: 'Black', size: 'S' }),
    ])

    expect(groups[0].rows.map((r) => r.cartItemKey)).toEqual(['b-s', 'b-xl', 'w-l', 'none'])
  })

  it('produces the same projection for a shuffled input', () => {
    const items = [
      garment({ cartItemKey: 'a', color: 'Black', size: 'M' }),
      garment({ cartItemKey: 'b', color: 'White', size: 'S' }),
      garment({ cartItemKey: 'c', productId: TEE_B, productName: 'Heavy Tee' }),
      badge({ cartItemKey: 'd' }),
      banner({ cartItemKey: 'e' }),
    ]

    const forward = buildCartProductGroups(items)
    const reversed = buildCartProductGroups([...items].reverse())
    const rotated = buildCartProductGroups([items[2], items[4], items[0], items[3], items[1]])

    expect(reversed).toEqual(forward)
    expect(rotated).toEqual(forward)
  })
})

// ── Pricing, errors and purity ───────────────────────────────────────────────

describe('pricing source and purity', () => {
  it('prefers the fresh quote over the stale persisted unit price', () => {
    const groups = buildCartProductGroups([garment({ cartItemKey: 'k1', unitPrice: 30, quantity: 2 })], {
      pricingByKey: { k1: pricing(27.5, 2) },
    })

    expect(groups[0].rows[0].unitPrice).toBe(27.5)
    expect(groups[0].rows[0].lineTotal).toBe(55)
  })

  it('falls back to the persisted price exactly like the pre-grouping cart when no quote exists', () => {
    const groups = buildCartProductGroups([garment({ cartItemKey: 'k1', unitPrice: 30, quantity: 2 })], {
      pricingByKey: {},
    })

    expect(groups[0].rows[0].unitPrice).toBe(30)
    expect(groups[0].rows[0].lineTotal).toBe(60)
  })

  it('keeps each pricing error attached to its own cartItemKey', () => {
    const groups = buildCartProductGroups(
      [garment({ cartItemKey: 'ok' }), garment({ cartItemKey: 'bad', color: 'White' })],
      { errorsByKey: { bad: 'Print option unavailable.' } },
    )

    const byKey = Object.fromEntries(groups[0].rows.map((r) => [r.cartItemKey, r.pricingError]))
    expect(byKey.bad).toBe('Print option unavailable.')
    expect(byKey.ok).toBeUndefined()
  })

  it('carries the print-pricing-group tier quantity through untouched, defaulting to the line quantity', () => {
    const groups = buildCartProductGroups(
      [garment({ cartItemKey: 'k1', quantity: 4 }), garment({ cartItemKey: 'k2', color: 'White', quantity: 6 })],
      { tierQuantityByKey: { k1: 10 } },
    )

    const byKey = Object.fromEntries(groups[0].rows.map((r) => [r.cartItemKey, r.printTierQuantity]))
    expect(byKey.k1).toBe(10)
    expect(byKey.k2).toBe(6) // no group total supplied → falls back to this line's quantity
  })

  it('does not mutate the input array or any input item', () => {
    const items = [
      garment({ cartItemKey: 'b', color: 'White', size: 'S' }),
      garment({ cartItemKey: 'a', color: 'Black', size: 'M' }),
      badge({ cartItemKey: 'c' }),
    ]
    const snapshot = structuredClone(items)
    const order = items.map((i) => i.cartItemKey)

    buildCartProductGroups(items, { pricingByKey: { a: pricing(1, 1) } })

    expect(items).toEqual(snapshot)
    expect(items.map((i) => i.cartItemKey)).toEqual(order)
  })
})

// ── Reconciliation invariants ────────────────────────────────────────────────

describe('reconciliation invariants', () => {
  const cart: CartItem[] = [
    garment({ cartItemKey: 'g1', quantity: 3, color: 'Black', size: 'M' }),
    garment({ cartItemKey: 'g2', quantity: 2, color: 'Black', size: 'L' }),
    garment({
      cartItemKey: 'g3',
      quantity: 4,
      color: 'White',
      size: 'M',
      prints: [print('Front', 'A3'), print('Back', 'A4')],
    }),
    garment({ cartItemKey: 'g4', quantity: 5, productId: TEE_B, productName: 'Heavy Tee' }),
    badge({ cartItemKey: 'b1', quantity: 10 }),
    banner({ cartItemKey: 'n1', quantity: 2 }),
  ]

  it('reconciles every group quantity with its own rows', () => {
    for (const group of buildCartProductGroups(cart)) {
      const rowSum = group.rows.reduce((sum, row) => sum + row.quantity, 0)
      expect(rowSum).toBe(group.totalQuantity)
    }
  })

  it('reconciles the total grouped quantity with the source cart', () => {
    const expected = cart.reduce((sum, item) => sum + item.quantity, 0)
    expect(totalGroupedQuantity(buildCartProductGroups(cart))).toBe(expected)
    expect(expected).toBe(26)
  })

  it('emits every cartItemKey exactly once and never moves a line into the wrong product', () => {
    const groups = buildCartProductGroups(cart)
    const keys = groups.flatMap((g) => g.rows.map((r) => r.cartItemKey))

    expect(keys).toHaveLength(cart.length)
    expect(new Set(keys).size).toBe(cart.length)
    expect([...keys].sort()).toEqual(cart.map((i) => i.cartItemKey).sort())

    for (const group of groups) {
      for (const row of group.rows) {
        expect(row.item.productId).toBe(group.productId)
      }
    }
  })

  it('does not change the number of cart lines or the quantity of any line', () => {
    const groups = buildCartProductGroups(cart)
    const rows = groups.flatMap((g) => g.rows)

    expect(rows).toHaveLength(cart.length)
    for (const item of cart) {
      const row = rows.find((r) => r.cartItemKey === item.cartItemKey)
      expect(row?.quantity).toBe(item.quantity)
      expect(row?.item).toBe(item) // same object reference, untouched
    }
  })

  it('does not change the repriced subtotal', () => {
    const pricingByKey: Record<string, CartRowPricingLike> = {
      g1: pricing(31, 3),
      g2: pricing(31, 2),
      g3: pricing(38, 4),
      g4: pricing(29, 5),
      b1: pricing(1.8, 10),
      n1: pricing(175, 2),
    }

    // Exactly the subtotal formula used by useCartPricing.
    const ungroupedSubtotal = cart.reduce((sum, item) => {
      const fresh = pricingByKey[item.cartItemKey]
      return sum + (fresh ? fresh.lineTotal : item.unitPrice * item.quantity)
    }, 0)

    const groupedSubtotal = buildCartProductGroups(cart, { pricingByKey })
      .flatMap((g) => g.rows)
      .reduce((sum, row) => sum + row.lineTotal, 0)

    expect(groupedSubtotal).toBe(ungroupedSubtotal)
  })

  it('does not change the checkout payload', () => {
    const before = buildOrderItemPayloads(cart)
    buildCartProductGroups(cart, { pricingByKey: { g1: pricing(1, 1) } })
    const after = buildOrderItemPayloads(cart)

    expect(after).toEqual(before)
    expect(after).toHaveLength(cart.length)
    expect(after.map((p) => p.productId)).toEqual(cart.map((i) => i.productId))
    expect(after.map((p) => p.quantity)).toEqual(cart.map((i) => i.quantity))
  })
})
