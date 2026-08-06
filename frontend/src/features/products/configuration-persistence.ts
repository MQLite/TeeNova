import type { PrintArea, PrintSize, Product } from '@/types'

/**
 * Browser-session persistence for the garment product configurator (Jira 10304).
 *
 * Purpose: a refresh, an accidental back/forward, or a recoverable route error must not silently
 * discard a configuration the customer spent minutes building. State is written to `sessionStorage`
 * (tab-scoped, cleared when the tab closes) and restored only after validation against the product
 * the page is currently showing.
 *
 * ── Deliberately NOT persisted ───────────────────────────────────────────────────────────────────
 *   • Uploaded artwork — neither bytes nor asset ids/URLs. Upload tokens address private storage and
 *     must not outlive the page that obtained them.
 *   • Per-area design notes — free-text the customer typed, which may contain anything.
 *   • Any price. Prices are never restored as truth; the backend is re-asked on restore.
 *   • Any customer identity, cart, checkout or payment state.
 *
 * ── Safety rules ─────────────────────────────────────────────────────────────────────────────────
 *   • Keys are scoped by product id **and** state-contract version, so one product's state can never
 *     be read into another and an old shape is ignored rather than misread.
 *   • Every read is validated against the *current* product and print configuration: unknown or
 *     unavailable variants, colours, areas and sizes are dropped, not restored.
 *   • Malformed JSON, a wrong shape, or an unavailable `sessionStorage` (private mode, SSR, quota)
 *     never throws — the caller simply gets `null` and starts clean.
 */

/** Bump whenever the persisted shape changes; old entries are then ignored, never misread. */
export const CONFIG_STATE_VERSION = 2

const KEY_PREFIX = 'teenova:product-config'

/** Upper bound on a restored quantity — mirrors the configurator's own input clamp. */
const MAX_QUANTITY = 999

export function configStateKey(productId: string): string {
  return `${KEY_PREFIX}:v${CONFIG_STATE_VERSION}:${productId}`
}

/** The non-sensitive slice of configurator state that survives a reload. */
export interface PersistedProductConfiguration {
  /** Colours enabled in the guided mobile quantity presentation. */
  selectedColors: string[]
  /** Selected colour swatch, or null when none is active. */
  selectedColor: string | null
  /** Selected gallery image id, or null to fall back to the first image for the colour. */
  selectedImageId: string | null
  /** variantId → quantity (only positive integers are kept). */
  variantQtys: Record<string, number>
  /** Selected print area ids, in selection order. */
  selectedPrintAreas: string[]
  /** printAreaId → selected print size id. */
  printSizeByArea: Record<string, string>
  /** Last valid mobile journey step. Presentation-only; never affects pricing or cart data. */
  mobileStep: MobileConfiguratorStep
  /** Expanded quantity card, when the customer chose one. */
  openQuantityColor: string | null
}

export const MOBILE_CONFIGURATOR_STEPS = ['colour', 'print', 'quantities', 'artwork', 'review'] as const
export type MobileConfiguratorStep = (typeof MOBILE_CONFIGURATOR_STEPS)[number]

export function isMobileConfiguratorStep(value: unknown): value is MobileConfiguratorStep {
  return typeof value === 'string' && MOBILE_CONFIGURATOR_STEPS.includes(value as MobileConfiguratorStep)
}

interface StoredEnvelope extends PersistedProductConfiguration {
  version: number
  productId: string
}

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null
    return window.sessionStorage
  } catch {
    // Access itself can throw when storage is blocked by policy.
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** True when the configuration holds nothing worth restoring (avoids writing empty envelopes). */
export function isEmptyConfiguration(state: PersistedProductConfiguration): boolean {
  return (
    state.selectedColor === null &&
    state.selectedColors.length === 0 &&
    state.selectedImageId === null &&
    Object.keys(state.variantQtys).length === 0 &&
    state.selectedPrintAreas.length === 0 &&
    Object.keys(state.printSizeByArea).length === 0 &&
    state.mobileStep === 'colour' &&
    state.openQuantityColor === null
  )
}

/** Writes the configuration for a product. Never throws; a full/blocked store is a silent no-op. */
export function saveProductConfiguration(
  productId: string,
  state: PersistedProductConfiguration,
): void {
  const store = storage()
  if (!store) return

  try {
    if (isEmptyConfiguration(state)) {
      store.removeItem(configStateKey(productId))
      return
    }
    const envelope: StoredEnvelope = { version: CONFIG_STATE_VERSION, productId, ...state }
    store.setItem(configStateKey(productId), JSON.stringify(envelope))
  } catch {
    // Quota exceeded or storage disabled — persistence is best-effort, never a hard failure.
  }
}

export function clearProductConfiguration(productId: string): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(configStateKey(productId))
  } catch {
    // ignore
  }
}

export interface RestoreContext {
  product: Product
  printAreas: PrintArea[]
  printSizes: PrintSize[]
}

export interface RestoreResult {
  state: PersistedProductConfiguration
  /** True when at least one stored selection was dropped because it is no longer available. */
  dropped: boolean
}

/**
 * Reads and validates the stored configuration for `context.product`.
 *
 * Returns `null` when there is nothing usable (absent, unreadable, wrong version, wrong product, or
 * everything in it was dropped). `dropped` tells the caller that the customer's stored setup was
 * only partially restorable, so it can say so rather than silently changing their configuration.
 */
export function restoreProductConfiguration(context: RestoreContext): RestoreResult | null {
  const store = storage()
  if (!store) return null

  let raw: string | null
  try {
    raw = store.getItem(configStateKey(context.product.id))
  } catch {
    return null
  }
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Corrupt entry — discard it so the customer is not stuck with an unreadable key.
    clearProductConfiguration(context.product.id)
    return null
  }

  if (!isRecord(parsed)) {
    clearProductConfiguration(context.product.id)
    return null
  }

  // Version/product mismatch is not an error: an old or foreign entry is simply not ours to read.
  if (parsed.version !== CONFIG_STATE_VERSION) return null
  if (parsed.productId !== context.product.id) return null

  const { product, printAreas, printSizes } = context

  const availableVariantIds = new Set(
    product.variants.filter((variant) => variant.isAvailable).map((variant) => variant.id),
  )
  const knownColors = new Set(product.variants.map((variant) => variant.color))
  const knownImageIds = new Set(product.images.map((image) => image.id))
  const knownAreaIds = new Set(printAreas.map((area) => area.id))
  const knownSizeIds = new Set(printSizes.map((size) => size.id))

  let dropped = false

  const selectedColors: string[] = []
  if (Array.isArray(parsed.selectedColors)) {
    for (const color of parsed.selectedColors) {
      if (typeof color !== 'string' || !knownColors.has(color) || selectedColors.includes(color)) {
        dropped = true
        continue
      }
      selectedColors.push(color)
    }
  }

  const storedColor = typeof parsed.selectedColor === 'string' ? parsed.selectedColor : null
  const selectedColor = storedColor !== null && knownColors.has(storedColor) ? storedColor : null
  if (storedColor !== null && selectedColor === null) dropped = true

  const storedImageId = typeof parsed.selectedImageId === 'string' ? parsed.selectedImageId : null
  const selectedImageId =
    storedImageId !== null && knownImageIds.has(storedImageId) ? storedImageId : null
  if (storedImageId !== null && selectedImageId === null) dropped = true

  const variantQtys: Record<string, number> = {}
  if (isRecord(parsed.variantQtys)) {
    for (const [variantId, value] of Object.entries(parsed.variantQtys)) {
      if (!availableVariantIds.has(variantId)) {
        dropped = true
        continue
      }
      if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        dropped = true
        continue
      }
      variantQtys[variantId] = Math.min(value, MAX_QUANTITY)
    }
  }

  const selectedPrintAreas: string[] = []
  if (Array.isArray(parsed.selectedPrintAreas)) {
    for (const areaId of parsed.selectedPrintAreas) {
      if (typeof areaId !== 'string' || !knownAreaIds.has(areaId) || selectedPrintAreas.includes(areaId)) {
        dropped = true
        continue
      }
      selectedPrintAreas.push(areaId)
    }
  }

  // Print sizes are validated here only against the *global* size catalogue and the restored areas.
  // Product/garment-size scoping is resolved asynchronously by the configurator, which already resets
  // a selection that its scope rejects — so a size restored here can still be dropped a moment later.
  const printSizeByArea: Record<string, string> = {}
  if (isRecord(parsed.printSizeByArea)) {
    for (const [areaId, sizeId] of Object.entries(parsed.printSizeByArea)) {
      if (!selectedPrintAreas.includes(areaId)) {
        dropped = true
        continue
      }
      if (typeof sizeId !== 'string' || !knownSizeIds.has(sizeId)) {
        dropped = true
        continue
      }
      printSizeByArea[areaId] = sizeId
    }
  }

  let mobileStep: MobileConfiguratorStep = isMobileConfiguratorStep(parsed.mobileStep)
    ? parsed.mobileStep
    : 'colour'
  if (!isMobileConfiguratorStep(parsed.mobileStep)) dropped = true

  // Review is a recovery destination only when the persisted, non-sensitive configuration can
  // still reach it. Pricing and artwork are deliberately not persisted, so pricing will rerun and
  // any currently-required artwork is completed again in the active page session.
  const hasQuantity = Object.keys(variantQtys).length > 0
  const printIsComplete = selectedPrintAreas.every((areaId) => Boolean(printSizeByArea[areaId]))
  if (mobileStep === 'review' && (!hasQuantity || !printIsComplete)) {
    mobileStep = !printIsComplete ? 'print' : 'quantities'
    dropped = true
  }

  const storedOpenColor = typeof parsed.openQuantityColor === 'string' ? parsed.openQuantityColor : null
  const openQuantityColor =
    storedOpenColor !== null && selectedColors.includes(storedOpenColor) ? storedOpenColor : null
  if (storedOpenColor !== null && openQuantityColor === null) dropped = true

  const state: PersistedProductConfiguration = {
    selectedColors,
    selectedColor,
    selectedImageId,
    variantQtys,
    selectedPrintAreas,
    printSizeByArea,
    mobileStep,
    openQuantityColor,
  }

  if (isEmptyConfiguration(state)) return null

  return { state, dropped }
}
