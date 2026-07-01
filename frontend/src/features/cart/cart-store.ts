import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem, CartItemPrint } from '@/types'

function mergePrintDesignData(existing: CartItemPrint[] = [], incoming: CartItemPrint[] = []) {
  return incoming.map((print) => {
    const current = existing.find(
      (item) => item.printAreaId === print.printAreaId && item.printSizeId === print.printSizeId,
    )

    return {
      ...print,
      uploadedAssetId: current?.uploadedAssetId ?? print.uploadedAssetId,
      uploadedAssetUrl: current?.uploadedAssetUrl ?? print.uploadedAssetUrl,
      designNote: current?.designNote ?? print.designNote,
    }
  })
}

interface CartStore {
  items: CartItem[]
  addItem: (item: CartItem) => void
  removeItem: (cartItemKey: string) => void
  updateQuantity: (cartItemKey: string, quantity: number) => void
  clearCart: () => void
  totalItems: () => number
  totalPrice: () => number
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem(newItem) {
        set((state) => {
          const existing = state.items.find(
            (i) => i.cartItemKey === newItem.cartItemKey,
          )
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.cartItemKey === newItem.cartItemKey
                  ? {
                      ...i,
                      quantity: i.quantity + newItem.quantity,
                      prints: mergePrintDesignData(i.prints, newItem.prints),
                    }
                  : i,
              ),
            }
          }
          return { items: [...state.items, newItem] }
        })
      },

      removeItem(cartItemKey) {
        set((state) => ({
          items: state.items.filter((i) => i.cartItemKey !== cartItemKey),
        }))
      },

      updateQuantity(cartItemKey, quantity) {
        if (quantity <= 0) {
          get().removeItem(cartItemKey)
          return
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.cartItemKey === cartItemKey ? { ...i, quantity } : i,
          ),
        }))
      },

      clearCart() {
        set({ items: [] })
      },

      totalItems() {
        return get().items.reduce((sum, i) => sum + i.quantity, 0)
      },

      totalPrice() {
        return get().items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
      },
    }),
    {
      name: 'teenova-cart',
      version: 6,
      migrate: (persistedState) => {
        const state = persistedState as {
          items?: Array<CartItem & { cartItemKey?: string }>
        } | undefined
        return {
          // printPricingGroupId is intentionally left undefined for legacy items so useCartPricing
          // backfills it from product metadata (Jira 9207) rather than assuming "ungrouped".
          // Badge fields (kind/pricingModel/design) are preserved as-is; legacy garment items simply
          // have them undefined, which the cart/checkout treat as a garment line.
          items: (state?.items ?? []).map((item) => ({
            cartItemKey: item.cartItemKey ?? `${item.productVariantId}__blank`,
            productId: item.productId,
            productVariantId: item.productVariantId,
            productName: item.productName,
            variantLabel: item.variantLabel,
            color: item.color,
            size: item.size,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            printPricingGroupId: item.printPricingGroupId,
            kind: item.kind,
            pricingModel: item.pricingModel,
            minimumQuantity: item.minimumQuantity,
            uploadedAssetId: item.uploadedAssetId,
            uploadedAssetUrl: item.uploadedAssetUrl,
            designNote: item.designNote,
            configurationJson: item.configurationJson,
            // FixedSize Banner config (Jira 9517); undefined for garment/badge lines.
            bannerDetail: item.bannerDetail,
            prints: item.prints ?? [],
          })),
        }
      },
    },
  ),
)
