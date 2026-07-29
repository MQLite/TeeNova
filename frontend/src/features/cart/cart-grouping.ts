import { bannerSizeSummary } from '@/lib/banner-format'
import type { CartItem, PricingModel, ProductKind } from '@/types'

/**
 * Pure product-grouped projection of the cart (Jira 10102, contract from Jira 10101).
 *
 * Outer group  = one ACTUAL product: `(productId, kind, pricingModel)` — never the product name,
 *                category, product-type label, variant label, print pricing group, colour or size.
 * Child row    = one SOURCE CART LINE, identified solely by `cartItemKey`. Cart lines are NEVER
 *                aggregated: two lines with the same product, colour and size but different
 *                `cartItemKey` (e.g. different print placements) stay separate rows so every
 *                quantity control and delete button keeps an exact one-to-one mutation identity.
 *
 * This module is deliberately free of React, Zustand, API and storage concerns: it takes the current
 * `items` plus the already-fetched pricing/error maps and returns a derived presentation model. It
 * never mutates the input array or any input item, so the persisted cart, the checkout payload and
 * every price stay byte-identical to the ungrouped behaviour.
 */

/** Displayed when a value genuinely does not exist on the line (never fabricated). */
export const MISSING_VALUE_LABEL = '—'

/** Displayed when the persisted product name is blank. */
export const UNNAMED_PRODUCT_LABEL = 'Unnamed product'

/** Safe defaults for legacy persisted lines that predate the kind/pricingModel fields (Jira 9504). */
export const DEFAULT_PRODUCT_KIND: ProductKind = 'Garment'
export const DEFAULT_PRICING_MODEL: PricingModel = 'GarmentPrint'

/**
 * Minimal structural shape the projection needs from a repriced line. `CartLinePricing` from
 * `useCartPricing` satisfies it; keeping it structural avoids importing the React hook module here.
 */
export interface CartRowPricingLike {
  unitPrice: number
  lineTotal: number
}

export interface BuildCartProductGroupsOptions<TPricing extends CartRowPricingLike> {
  /** Fresh backend quote per `cartItemKey`. Missing/undefined falls back to the persisted price. */
  pricingByKey?: Readonly<Record<string, TPricing | undefined>>
  /** Per-line pricing error per `cartItemKey` (e.g. a print option that is no longer selectable). */
  errorsByKey?: Readonly<Record<string, string | undefined>>
  /**
   * Total garment quantity of the line's PRINT PRICING GROUP (Jira 9207) per `cartItemKey`. This is a
   * pricing scope that deliberately spans several products and is NOT the product-group quantity;
   * it is carried through untouched so the existing tier hint keeps rendering the same figure.
   */
  tierQuantityByKey?: Readonly<Record<string, number | undefined>>
}

export interface CartProductRow<TPricing extends CartRowPricingLike = CartRowPricingLike> {
  /** The one and only mutation identity for this row. */
  cartItemKey: string
  /** The untouched source cart line (same object reference; never mutated). */
  item: CartItem
  /** Garment colour, or null when the line genuinely has none (Badge, Banner, legacy). */
  colour: string | null
  /** Garment size, or null when the line genuinely has none. */
  size: string | null
  quantity: number
  /** Repriced unit price when a fresh quote exists, else the persisted fallback. */
  unitPrice: number
  /** Repriced line total when a fresh quote exists, else `item.unitPrice * item.quantity`. */
  lineTotal: number
  /**
   * Short production detail that explains why this row is separate from another row with the same
   * colour and size (e.g. "Front A3 + Back A4"). Null when the line carries no such detail.
   */
  detailLabel: string | null
  /** The fresh quote for this line, when one exists. */
  pricing?: TPricing
  /** Per-line pricing error, when one exists. */
  pricingError?: string
  /** Print-pricing-group quantity used by the existing tier hint; falls back to this line's quantity. */
  printTierQuantity: number
}

export interface CartProductGroup<TPricing extends CartRowPricingLike = CartRowPricingLike> {
  /** `{productId}|{kind}|{pricingModel}` — stable, identifier-based, never name-based. */
  groupKey: string
  productId: string
  /** Display name from the line snapshot; `UNNAMED_PRODUCT_LABEL` when blank. Never part of the key. */
  productName: string
  kind: ProductKind
  pricingModel: PricingModel
  /** Sum of this group's row quantities — always reconciles with the source lines. */
  totalQuantity: number
  rows: CartProductRow<TPricing>[]
}

// ── Field resolution ─────────────────────────────────────────────────────────

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length === 0 ? null : trimmed
}

export function resolveProductKind(item: CartItem): ProductKind {
  return item.kind ?? DEFAULT_PRODUCT_KIND
}

export function resolvePricingModel(item: CartItem): PricingModel {
  return item.pricingModel ?? DEFAULT_PRICING_MODEL
}

export function resolveProductName(item: CartItem): string {
  return blankToNull(item.productName) ?? UNNAMED_PRODUCT_LABEL
}

/**
 * Splits a "Colour / Size" variant label on the LAST " / " so colours containing a slash stay intact.
 * Mirrors the backend `OrderVariantLabelParser` / production-PDF `SplitVariantLabel` semantics.
 */
export function splitVariantLabel(variantLabel: string | null | undefined): {
  colour: string | null
  size: string | null
} {
  const label = variantLabel?.trim() ?? ''
  if (label.length === 0) return { colour: null, size: null }

  const idx = label.lastIndexOf(' / ')
  if (idx < 0) return { colour: label, size: null }

  return {
    colour: blankToNull(label.slice(0, idx)),
    size: blankToNull(label.slice(idx + 3)),
  }
}

/** Discrete `color`/`size` first; falls back to parsing `variantLabel` for legacy lines. */
function resolveColourAndSize(item: CartItem): { colour: string | null; size: string | null } {
  const colour = blankToNull(item.color)
  const size = blankToNull(item.size)
  if (colour !== null && size !== null) return { colour, size }

  const parsed = splitVariantLabel(item.variantLabel)
  return { colour: colour ?? parsed.colour, size: size ?? parsed.size }
}

/**
 * The distinguishing production detail for a row, by kind. Only ever derived from data actually
 * present on the line — a line with nothing to distinguish it returns null (rendered as "—").
 */
export function buildDetailLabel(item: CartItem): string | null {
  const kind = resolveProductKind(item)

  if (kind === 'Banner') {
    const size = item.bannerDetail ? blankToNull(bannerSizeSummary(item.bannerDetail)) : null
    return size ?? blankToNull(item.designNote) ?? (item.uploadedAssetUrl ? 'Design uploaded' : null)
  }

  if (kind === 'Garment') {
    const prints = (item.prints ?? [])
      .map((print) =>
        [blankToNull(print.printAreaName), blankToNull(print.printSizeName)]
          .filter((part): part is string => part !== null)
          .join(' '),
      )
      .filter((label) => label.length > 0)

    return prints.length === 0 ? null : prints.join(' + ')
  }

  // Badge and any future item-level-design kind.
  return blankToNull(item.designNote) ?? (item.uploadedAssetUrl ? 'Design uploaded' : null)
}

// ── Ordering ─────────────────────────────────────────────────────────────────

const KIND_RANK: Record<ProductKind, number> = {
  Garment: 0,
  Badge: 1,
  Banner: 2,
  Other: 3,
}

function kindRank(kind: ProductKind): number {
  return KIND_RANK[kind] ?? 3
}

/** Canonical apparel size sequence (index = rank), mirroring the production sheet's ordering. */
const SIZE_SEQUENCE = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL', 'XXXXXL', 'XXXXXXL']

const NUMERIC_XL_SIZE = /^(\d+)\s*XL$/
const MISSING_SIZE_RANK = Number.MAX_SAFE_INTEGER
const UNKNOWN_SIZE_RANK = Number.MAX_SAFE_INTEGER - 1

/**
 * Ranks a garment size for sorting: known apparel sizes in their natural sequence (XXS…6XL), then
 * purely numeric children's sizes in numeric order, then any other named size, then missing size
 * last. Normalises "2XL"/"3XL" to "XXL"/"XXXL". Frontend-only helper — the backend keeps its own.
 */
export function garmentSizeRank(size: string | null | undefined): number {
  const raw = size?.trim().toUpperCase() ?? ''
  if (raw.length === 0) return MISSING_SIZE_RANK

  let normalised = raw
  const numericXl = NUMERIC_XL_SIZE.exec(raw)
  if (numericXl) {
    const count = Number.parseInt(numericXl[1], 10)
    if (Number.isFinite(count) && count >= 2) normalised = 'X'.repeat(count) + 'L'
  }

  const idx = SIZE_SEQUENCE.indexOf(normalised)
  if (idx >= 0) return idx

  if (/^\d+$/.test(normalised)) return 10_000 + Number.parseInt(normalised, 10)

  return UNKNOWN_SIZE_RANK
}

/** Case-insensitive compare with a case-sensitive tiebreak, so the result is total and stable. */
function compareLabels(a: string, b: string): number {
  const lowerA = a.toLowerCase()
  const lowerB = b.toLowerCase()
  if (lowerA < lowerB) return -1
  if (lowerA > lowerB) return 1
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/** Missing values (null) always sort after real values. */
function compareNullableLabels(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return compareLabels(a, b)
}

function compareOrdinal(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

// ── Projection ───────────────────────────────────────────────────────────────

/**
 * Builds the deterministic product-grouped presentation model. The output order is independent of the
 * input order; the input array and its items are left untouched.
 */
export function buildCartProductGroups<TPricing extends CartRowPricingLike = CartRowPricingLike>(
  items: readonly CartItem[],
  options: BuildCartProductGroupsOptions<TPricing> = {},
): CartProductGroup<TPricing>[] {
  const { pricingByKey, errorsByKey, tierQuantityByKey } = options

  const groupsByKey = new Map<string, CartProductGroup<TPricing>>()

  for (const item of items) {
    const kind = resolveProductKind(item)
    const pricingModel = resolvePricingModel(item)
    const groupKey = `${item.productId}|${kind}|${pricingModel}`

    let group = groupsByKey.get(groupKey)
    if (!group) {
      group = {
        groupKey,
        productId: item.productId,
        productName: resolveProductName(item),
        kind,
        pricingModel,
        totalQuantity: 0,
        rows: [],
      }
      groupsByKey.set(groupKey, group)
    }

    const pricing = pricingByKey?.[item.cartItemKey]
    const { colour, size } = resolveColourAndSize(item)

    group.rows.push({
      cartItemKey: item.cartItemKey,
      item,
      colour,
      size,
      quantity: item.quantity,
      // Identical fallback chain to the pre-grouping cart page: fresh quote first, persisted price only
      // when no quote exists yet, so the subtotal can never drift.
      unitPrice: pricing?.unitPrice ?? item.unitPrice,
      lineTotal: pricing?.lineTotal ?? item.unitPrice * item.quantity,
      detailLabel: buildDetailLabel(item),
      pricing,
      pricingError: errorsByKey?.[item.cartItemKey],
      printTierQuantity: tierQuantityByKey?.[item.cartItemKey] ?? item.quantity,
    })
    group.totalQuantity += item.quantity
  }

  const groups = Array.from(groupsByKey.values())

  for (const group of groups) {
    group.rows.sort(
      (a, b) =>
        compareNullableLabels(a.colour, b.colour) ||
        garmentSizeRank(a.size) - garmentSizeRank(b.size) ||
        compareNullableLabels(a.size, b.size) ||
        compareNullableLabels(a.detailLabel, b.detailLabel) ||
        compareOrdinal(a.cartItemKey, b.cartItemKey),
    )
  }

  groups.sort(
    (a, b) =>
      kindRank(a.kind) - kindRank(b.kind) ||
      compareLabels(a.productName, b.productName) ||
      compareOrdinal(a.productId, b.productId) ||
      compareOrdinal(a.groupKey, b.groupKey),
  )

  return groups
}

/** Total quantity across every group — must equal the sum of the source cart-line quantities. */
export function totalGroupedQuantity<TPricing extends CartRowPricingLike>(
  groups: readonly CartProductGroup<TPricing>[],
): number {
  return groups.reduce((sum, group) => sum + group.totalQuantity, 0)
}
