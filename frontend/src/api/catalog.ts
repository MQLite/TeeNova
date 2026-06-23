import { apiClient, type ApiClient } from '@/lib/api-client'
import type {
  BulkSaveProductVariantsPayload,
  InventoryStatus,
  PagedResult,
  Product,
  ProductImage,
  ProductListItem,
  ProductVariant,
  SetProductPriceTiersPayload,
} from '@/types'

interface GetProductsParams {
  search?: string
  productType?: string
  isActive?: boolean
  skipCount?: number
  maxResultCount?: number
}

export interface CreateProductPayload {
  name: string
  description?: string | null
  basePrice: number
  productType: string
  isActive: boolean
}

export interface UpdateProductPayload {
  name: string
  description?: string | null
  basePrice: number
  productType: string
  isActive: boolean
}

export interface CreateVariantPayload {
  sku: string
  color: string
  size: string
  priceAdjustment?: number
  stockQuantity?: number
  isAvailable?: boolean
}

export interface UpdateVariantPayload {
  sku: string
  color: string
  size: string
  priceAdjustment: number
  stockQuantity: number
  isAvailable: boolean
}

export interface UpdateProductImagePayload {
  color?: string | null
}

/**
 * Payload for the dedicated variant inventory endpoint (Jira 9003).
 * This is the ONLY frontend write path for inventory — never send these fields
 * through create/update/bulk variant saves (the backend ignores them there).
 */
export interface UpdateVariantInventoryPayload {
  inventoryStatus: InventoryStatus
  stockQuantity?: number | null
  lowStockThreshold?: number | null
  inventoryNote?: string | null
}

export function makeCatalogApi(client: ApiClient) {
  return {
    getProducts(params?: GetProductsParams): Promise<PagedResult<ProductListItem>> {
      return client.get('/api/catalog/products', {
        search: params?.search,
        productType: params?.productType,
        isActive: params?.isActive,
        skipCount: params?.skipCount ?? 0,
        maxResultCount: params?.maxResultCount ?? 20,
      })
    },

    getProduct(id: string): Promise<Product> {
      return client.get(`/api/catalog/products/${id}`)
    },

    createProduct(payload: CreateProductPayload): Promise<Product> {
      return client.post('/api/catalog/products', payload)
    },

    updateProduct(id: string, payload: UpdateProductPayload): Promise<Product> {
      return client.put(`/api/catalog/products/${id}`, payload)
    },

    updateProductStatus(id: string, isActive: boolean): Promise<Product> {
      return client.put(`/api/catalog/products/${id}/status`, { isActive })
    },

    createVariant(productId: string, payload: CreateVariantPayload): Promise<ProductVariant> {
      return client.post(`/api/catalog/products/${productId}/variants`, payload)
    },

    updateVariant(productId: string, variantId: string, payload: UpdateVariantPayload): Promise<ProductVariant> {
      return client.put(`/api/catalog/products/${productId}/variants/${variantId}`, payload)
    },

    deleteVariant(productId: string, variantId: string): Promise<void> {
      return client.delete(`/api/catalog/products/${productId}/variants/${variantId}`)
    },

    /** Records informational inventory for a variant. The only write path for inventory. */
    updateVariantInventory(
      productId: string,
      variantId: string,
      payload: UpdateVariantInventoryPayload,
    ): Promise<ProductVariant> {
      return client.put(
        `/api/catalog/products/${productId}/variants/${variantId}/inventory`,
        payload,
      )
    },

    bulkSaveVariants(productId: string, payload: BulkSaveProductVariantsPayload): Promise<ProductVariant[]> {
      return client.put<ProductVariant[]>(`/api/catalog/products/${productId}/variants/bulk`, payload)
    },

    /**
     * Replaces the full set of quantity-break price tiers for a product (the only write path for
     * tiers — never sent through product update or variant bulk-save). Sending an empty list
     * clears all tiers, reverting the product to additive pricing. Returns the updated product.
     */
    setProductPriceTiers(productId: string, payload: SetProductPriceTiersPayload): Promise<Product> {
      return client.put<Product>(`/api/catalog/products/${productId}/price-tiers`, payload)
    },

    uploadProductImage(productId: string, file: File): Promise<ProductImage> {
      return client.uploadFile<ProductImage>(`/api/catalog/products/${productId}/images/upload`, file)
    },

    updateProductImage(productId: string, imageId: string, payload: UpdateProductImagePayload): Promise<ProductImage> {
      return client.put(`/api/catalog/products/${productId}/images/${imageId}`, payload)
    },

    setPrimaryProductImage(productId: string, imageId: string): Promise<void> {
      return client.put(`/api/catalog/products/${productId}/images/${imageId}/primary`)
    },

    deleteProductImage(productId: string, imageId: string): Promise<void> {
      return client.delete(`/api/catalog/products/${productId}/images/${imageId}`)
    },
  }
}

export const catalogApi = makeCatalogApi(apiClient)
