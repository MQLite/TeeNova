import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CartProductGroupCard } from './CartProductGroupCard'
import { buildCartProductGroups } from '@/features/cart/cart-grouping'
import type { CartLinePricing } from '@/features/cart/useCartPricing'
import type { CartItem } from '@/types'

const TEE = '11111111-1111-1111-1111-111111111111'

function linePricing(overrides: Partial<CartLinePricing> = {}): CartLinePricing {
  return {
    garmentUnitPrice: 25,
    printUnitPrice: 5,
    unitPrice: 30,
    lineTotal: 60,
    pricingMode: 'Additive',
    prints: [],
    appliedTierMinQuantity: null,
    nextTierMinQuantity: null,
    nextTierUnitPrintPrice: null,
    currency: 'NZD',
    ...overrides,
  }
}

/** Two lines that are identical apart from their print configuration — the critical ambiguity case. */
const sameVariantDifferentPrints: CartItem[] = [
  {
    cartItemKey: 'front-only',
    productId: TEE,
    productVariantId: 'variant-1',
    productName: 'Staple Tee',
    variantLabel: 'Black / M',
    color: 'Black',
    size: 'M',
    unitPrice: 30,
    quantity: 2,
    prints: [
      { printAreaId: 'a-front', printAreaName: 'Front', printSizeId: 's-a3', printSizeName: 'A3' },
    ],
  },
  {
    cartItemKey: 'front-and-back',
    productId: TEE,
    productVariantId: 'variant-1',
    productName: 'Staple Tee',
    variantLabel: 'Black / M',
    color: 'Black',
    size: 'M',
    unitPrice: 38,
    quantity: 3,
    prints: [
      { printAreaId: 'a-front', printAreaName: 'Front', printSizeId: 's-a3', printSizeName: 'A3' },
      { printAreaId: 'a-back', printAreaName: 'Back', printSizeId: 's-a4', printSizeName: 'A4' },
    ],
  },
]

function renderGroup(items: CartItem[], pricingByKey: Record<string, CartLinePricing> = {}) {
  const handlers = { onIncrease: vi.fn(), onDecrease: vi.fn(), onRemove: vi.fn() }
  const [group] = buildCartProductGroups<CartLinePricing>(items, { pricingByKey })
  render(<CartProductGroupCard group={group} {...handlers} />)
  return handlers
}

function row(cartItemKey: string) {
  return screen.getByTestId(`cart-row-${cartItemKey}`)
}

describe('CartProductGroupCard', () => {
  it('shows the product identity once and the group total quantity', () => {
    renderGroup(sameVariantDifferentPrints)

    expect(screen.getAllByText('Staple Tee')).toHaveLength(1)
    expect(screen.getByText('Total quantity: 5')).toBeInTheDocument()
    expect(screen.getByText('2 lines')).toBeInTheDocument()
  })

  it('renders one child row per source cart line, never merged', () => {
    renderGroup(sameVariantDifferentPrints)

    expect(row('front-only')).toBeInTheDocument()
    expect(row('front-and-back')).toBeInTheDocument()
  })

  it('surfaces each distinguishing print detail once in its visual subgroup header', () => {
    renderGroup(sameVariantDifferentPrints)

    expect(screen.getAllByText('Front · A3')).toHaveLength(2)
    expect(screen.getByText('Back · A4')).toBeInTheDocument()
    expect(screen.getAllByText('Black')).toHaveLength(2)
  })

  it('increases exactly one source row', async () => {
    const user = userEvent.setup()
    const handlers = renderGroup(sameVariantDifferentPrints)

    await user.click(within(row('front-and-back')).getByRole('button', { name: /increase quantity/i }))

    expect(handlers.onIncrease).toHaveBeenCalledTimes(1)
    expect(handlers.onIncrease).toHaveBeenCalledWith('front-and-back')
    expect(handlers.onDecrease).not.toHaveBeenCalled()
    expect(handlers.onRemove).not.toHaveBeenCalled()
  })

  it('decreases exactly one source row', async () => {
    const user = userEvent.setup()
    const handlers = renderGroup(sameVariantDifferentPrints)

    await user.click(within(row('front-only')).getByRole('button', { name: /decrease quantity/i }))

    expect(handlers.onDecrease).toHaveBeenCalledTimes(1)
    expect(handlers.onDecrease).toHaveBeenCalledWith('front-only')
    expect(handlers.onIncrease).not.toHaveBeenCalled()
  })

  it('deletes exactly one source row', async () => {
    const user = userEvent.setup()
    const handlers = renderGroup(sameVariantDifferentPrints)

    await user.click(within(row('front-only')).getByRole('button', { name: /^remove/i }))

    expect(handlers.onRemove).toHaveBeenCalledTimes(1)
    expect(handlers.onRemove).toHaveBeenCalledWith('front-only')
  })

  it('shows the repriced unit price and line total, not the stale persisted price', () => {
    renderGroup([sameVariantDifferentPrints[0]], {
      'front-only': linePricing({ unitPrice: 27.5, lineTotal: 55 }),
    })

    expect(within(row('front-only')).getByText('$55.00 total')).toBeInTheDocument()
    expect(within(row('front-only')).getByText('$27.50 each')).toBeInTheDocument()
  })

  it('keeps a pricing error on its own row', () => {
    const [group] = buildCartProductGroups<CartLinePricing>(sameVariantDifferentPrints, {
      errorsByKey: { 'front-only': 'Print option unavailable.' },
    })
    render(
      <CartProductGroupCard group={group} onIncrease={vi.fn()} onDecrease={vi.fn()} onRemove={vi.fn()} />,
    )

    expect(within(row('front-only')).getByText('Print option unavailable.')).toBeInTheDocument()
    expect(within(row('front-and-back')).queryByText('Print option unavailable.')).not.toBeInTheDocument()
  })

  it('renders a garment row with a missing colour/size as the controlled fallback', () => {
    renderGroup([
      { ...sameVariantDifferentPrints[0], color: undefined, size: undefined, variantLabel: undefined },
    ])

    expect(screen.getByRole('heading', { level: 4, name: '—' })).toBeInTheDocument()
    expect(within(row('front-only')).getByText('Size —')).toBeInTheDocument()
  })

  it('omits apparel fields for a Badge line', () => {
    renderGroup([
      {
        cartItemKey: 'badge-1',
        productId: 'badge-product',
        productName: 'Round Badge',
        unitPrice: 2,
        quantity: 10,
        kind: 'Badge',
        pricingModel: 'QuantityTierUnit',
        uploadedAssetUrl: '/uploads/designs/badge.png',
        designNote: 'Club logo',
        prints: [],
      },
    ])

    const badgeRow = row('badge-1')
    expect(within(badgeRow).queryByText('Colour')).not.toBeInTheDocument()
    expect(within(badgeRow).queryByText('Size')).not.toBeInTheDocument()
    expect(within(badgeRow).getByText('Badge')).toBeInTheDocument()
    expect(within(badgeRow).getByText('Club logo')).toBeInTheDocument()
    // Quantity is shown both as the row's Qty field and inside the quantity control.
    expect(within(badgeRow).getAllByText('10').length).toBeGreaterThan(0)
  })

  it('renders the banner configuration instead of apparel fields for a FixedSize Banner line', () => {
    renderGroup([
      {
        cartItemKey: 'banner-1',
        productId: 'banner-product',
        productName: 'Pull-up Banner',
        unitPrice: 180,
        quantity: 2,
        kind: 'Banner',
        pricingModel: 'FixedSize',
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
      },
    ])

    const bannerRow = row('banner-1')
    expect(within(bannerRow).queryByText('Colour')).not.toBeInTheDocument()
    expect(within(bannerRow).getByText('Banner · Fixed size')).toBeInTheDocument()
    expect(within(bannerRow).getByText('850 × 2000 mm')).toBeInTheDocument()
    expect(within(bannerRow).getByText('Pull-up')).toBeInTheDocument()
  })

  it('labels the group image as a design preview rather than a product photo', () => {
    renderGroup([
      {
        ...sameVariantDifferentPrints[0],
        prints: [
          {
            printAreaId: 'a-front',
            printAreaName: 'Front',
            printSizeId: 's-a3',
            printSizeName: 'A3',
            uploadedAssetUrl: '/uploads/designs/logo.png',
          },
        ],
      },
    ])

    const image = screen.getByRole('img', { name: /uploaded design preview for staple tee/i })
    expect(image).toHaveAttribute('src', '/uploads/designs/logo.png')
    expect(screen.getByText(/not a product photo/i)).toBeInTheDocument()
  })
})
