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
      version: 3,
      migrate: (persistedState) => {
        const state = persistedState as {
          items?: Array<CartItem & { cartItemKey?: string }>
        } | undefined
        return {
          items: (state?.items ?? []).map(({ cartItemKey, productId, productVariantId, productName, variantLabel, color, size, unitPrice, quantity, prints }) => ({
            cartItemKey: cartItemKey ?? `${productVariantId}__blank`,
            productId,
            productVariantId,
            productName,
            variantLabel,
            color,
            size,
            unitPrice,
            quantity,
            prints: prints ?? [],
          })),
        }
      },
    },
  ),
)
