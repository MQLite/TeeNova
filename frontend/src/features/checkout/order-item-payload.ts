import type { CreateOrderItemPayload } from '@/api/orders'
import type { CartItem } from '@/types'

/**
 * Maps cart lines to the price-free item payload the backend accepts.
 *
 * Shared by order creation and the draft payment quote so both send the IDENTICAL shape — the quote is
 * priced from exactly what the order will be priced from, and neither path can drift into sending a price.
 * No path emits unitPrice, lineTotal, subtotal or any other monetary field: the backend is the sole
 * pricing authority (Jira 9504/9517, Stripe surcharge Phase 4).
 */
export function buildOrderItemPayloads(items: CartItem[]): CreateOrderItemPayload[] {
  return items.map((item) => {
    if (item.kind === 'Banner' && item.pricingModel === 'FixedSize') {
      return {
        productId: item.productId,
        quantity: item.quantity,
        uploadedAssetId: item.uploadedAssetId,
        uploadedAssetUrl: item.uploadedAssetUrl,
        designNote: item.designNote,
        bannerDetail: item.bannerDetail,
      }
    }

    if (item.kind === 'Badge') {
      return {
        productId: item.productId,
        quantity: item.quantity,
        uploadedAssetId: item.uploadedAssetId,
        uploadedAssetUrl: item.uploadedAssetUrl,
        designNote: item.designNote,
      }
    }

    return {
      productId: item.productId,
      productVariantId: item.productVariantId,
      quantity: item.quantity,
      prints: (item.prints ?? []).map((print) => ({
        printAreaId: print.printAreaId,
        printSizeId: print.printSizeId,
        uploadedAssetId: print.uploadedAssetId,
        uploadedAssetUrl: print.uploadedAssetUrl,
        designNote: print.designNote,
      })),
    }
  })
}

/**
 * Dependency signature for the draft payment quote: every cart input that can change the quoted amount,
 * in a stable order. A change invalidates the current fingerprint and forces a fresh quote before any
 * payment can be started.
 */
export function draftQuoteSignature(
  items: CartItem[],
  deliveryMethod: string,
  provider: string,
): string {
  return JSON.stringify({
    provider,
    deliveryMethod,
    items: items.map((item) => ({
      k: item.cartItemKey,
      p: item.productId,
      v: item.productVariantId ?? null,
      q: item.quantity,
      sp: item.bannerDetail?.sizePresetId ?? null,
      prints: (item.prints ?? [])
        .map((print) => `${print.printAreaId}:${print.printSizeId}`)
        .sort(),
    })),
  })
}
