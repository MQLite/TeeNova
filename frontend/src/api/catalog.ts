import { apiClient, type ApiClient } from '@/lib/api-client'
import type {
  BulkSaveProductVariantsPayload,
  CreateUpdatePrintPricingGroup,
  InventoryStatus,
  PagedResult,
  PrintPricingGroup,
  Product,
  ProductImage,
  ProductListItem,
  ProductPrintConfigOption,
  ProductPrintPriceTier,
  ProductVariant,
  SetProductPrintConfigOptionsPayload,
  SetProductPrintPriceTiersPayload,
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
  /** Optional print-pricing group assignment (Jira 9203). Null = ungrouped. */
  printPricingGroupId?: string | null
}

export interface UpdateProductPayload {
  name: string
  description?: string | null
  basePrice: number
  productType: string
  isActive: boolean
  /**
   * Print-pricing group assignment (Jira 9203). The product update is a full replace of the
   * product's own scalar fields, so this MUST be sent on every update or the assignment is cleared.
   */
  printPricingGroupId?: string | null
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
     * @deprecated Legacy all-in price tiers (Jira 9102). Inert in backend pricing since 9203.
     * Do not call from new UI — use {@link setPrintPriceTiers} for print-only pricing.
     */
    setProductPriceTiers(productId: string, payload: SetProductPriceTiersPayload): Promise<Product> {
      return client.put<Product>(`/api/catalog/products/${productId}/price-tiers`, payload)
    },

    // ── Print pricing groups (Jira 9203) ──────────────────────────────────────

    listPrintPricingGroups(isActive?: boolean): Promise<PrintPricingGroup[]> {
      return client.get('/api/catalog/print-pricing-groups', { isActive })
    },

    createPrintPricingGroup(payload: CreateUpdatePrintPricingGroup): Promise<PrintPricingGroup> {
      return client.post('/api/catalog/print-pricing-groups', payload)
    },

    updatePrintPricingGroup(groupId: string, payload: CreateUpdatePrintPricingGroup): Promise<PrintPricingGroup> {
      return client.put(`/api/catalog/print-pricing-groups/${groupId}`, payload)
    },

    /** Print-only tiers for a group. */
    getPrintPriceTiers(groupId: string): Promise<ProductPrintPriceTier[]> {
      return client.get(`/api/catalog/print-pricing-groups/${groupId}/print-price-tiers`)
    },

    /**
     * Replaces a group's full print-tier set (single-writer). Empty list clears the group's tiers
     * (printing falls back to PrintSize.BasePrice). Does not touch products/variants/options.
     */
    setPrintPriceTiers(groupId: string, payload: SetProductPrintPriceTiersPayload): Promise<ProductPrintPriceTier[]> {
      return client.put(`/api/catalog/print-pricing-groups/${groupId}/print-price-tiers`, payload)
    },

    // ── Product/size scoped allowed print options (Jira 9204) ──────────────────

    getProductPrintConfigOptions(productId: string): Promise<ProductPrintConfigOption[]> {
      return client.get(`/api/catalog/products/${productId}/print-config-options`)
    },

    /**
     * Replaces a product's full scoped allowed-option set (single-writer). Empty list reverts the
     * product to the global PrintAreaSizeOption matrix. Selectability only — never affects price.
     */
    setProductPrintConfigOptions(productId: string, payload: SetProductPrintConfigOptionsPayload): Promise<ProductPrintConfigOption[]> {
      return client.put(`/api/catalog/products/${productId}/print-config-options`, payload)
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
