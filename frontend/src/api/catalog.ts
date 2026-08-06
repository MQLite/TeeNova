import { apiClient, type ApiClient, type ReadRequestOptions } from '@/lib/api-client'
import type {
  BulkSaveProductVariantsPayload,
  CreateUpdatePrintPricingGroup,
  InventoryStatus,
  PagedResult,
  PricingModel,
  PrintPricingGroup,
  Product,
  ProductImage,
  ProductKind,
  ProductListItem,
  ProductFixedSizePriceOption,
  ProductPrintConfigOption,
  ProductPrintPriceTier,
  ProductQuantityPriceTier,
  ProductVariant,
  SetProductFixedSizePriceOptionsPayload,
  SetProductPrintConfigOptionsPayload,
  SetProductPrintPriceTiersPayload,
  SetProductPriceTiersPayload,
  SetProductQuantityPriceTiersPayload,
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
  // ── Product kind / pricing model (Jira 9503/9504) ─────────────────────────
  /** Business category. Defaults to Garment server-side when omitted (backward compatible). */
  kind?: ProductKind
  /** Pricing behavior. Defaults to GarmentPrint server-side when omitted. */
  pricingModel?: PricingModel
  /** Minimum sellable quantity (≥ 1). */
  minimumQuantity?: number
  /** When true, an order item for this product must carry a design asset. */
  designUploadRequired?: boolean
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
  // ── Product kind / pricing model (Jira 9503/9504) ─────────────────────────
  // Like printPricingGroupId, these are part of the full scalar replace: send them on every update
  // or the backend defaults Kind/PricingModel back to Garment/GarmentPrint and MinimumQuantity to 1.
  // NOTE: this update never touches Badge quantity price tiers — those have a dedicated endpoint.
  kind?: ProductKind
  pricingModel?: PricingModel
  minimumQuantity?: number
  designUploadRequired?: boolean
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
    /**
     * Public product list. `cacheOptions` is honoured server-side only (see `catalog-cache.ts`) and
     * is used by the server-rendered service pages (Jira 10306) so a service page stays statically
     * renderable; every other caller keeps the `no-store` default.
     */
    getProducts(
      params?: GetProductsParams,
      cacheOptions?: ReadRequestOptions,
    ): Promise<PagedResult<ProductListItem>> {
      return client.get(
        '/api/catalog/products',
        {
          search: params?.search,
          productType: params?.productType,
          isActive: params?.isActive,
          skipCount: params?.skipCount ?? 0,
          maxResultCount: params?.maxResultCount ?? 20,
        },
        cacheOptions,
      )
    },

    /**
     * Public product detail. `cacheOptions` is honoured server-side only and is used exclusively by
     * the server-rendered product route (Jira 10304); every other caller keeps the `no-store`
     * default. Anonymous callers receive active products only (backend Jira 9808).
     */
    getProduct(id: string, cacheOptions?: ReadRequestOptions): Promise<Product> {
      return client.get(`/api/catalog/products/${id}`, undefined, cacheOptions)
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

    // ── Badge quantity-tier unit prices (Jira 9503/9504) ───────────────────────
    // Dedicated single-writer endpoint: the ordinary product update never reads or writes these, so
    // saving product fields can't clobber the tiers and vice versa.

    /** Reads a Badge product's quantity-tier unit prices. */
    getQuantityPriceTiers(productId: string): Promise<ProductQuantityPriceTier[]> {
      return client.get(`/api/catalog/products/${productId}/quantity-price-tiers`)
    },

    /**
     * Replaces a Badge product's full quantity-tier set (single-writer). Empty list clears the
     * product's tiers (no resolvable Badge price until configured again). Does not touch product
     * scalar fields, variants, or print pricing.
     */
    setQuantityPriceTiers(productId: string, payload: SetProductQuantityPriceTiersPayload): Promise<ProductQuantityPriceTier[]> {
      return client.put(`/api/catalog/products/${productId}/quantity-price-tiers`, payload)
    },

    // ── Banner fixed-size price options (Jira 9516/9517) ───────────────────────
    // Dedicated single-writer endpoint: the ordinary product update never reads or writes these, so
    // saving product fields can't clobber the options and vice versa. Writing is gated server-side to
    // Banner + FixedSize products and to the Admin role. Call GET/PUT through the admin client in admin.

    /** Reads a Banner product's fixed-size price options (admin GET includes inactive rows). */
    getFixedSizePriceOptions(productId: string): Promise<ProductFixedSizePriceOption[]> {
      return client.get(`/api/catalog/products/${productId}/fixed-size-price-options`)
    },

    /**
     * Replaces a Banner product's full fixed-size option set (single-writer). Empty list clears the
     * product's options (no selectable fixed-size price until configured again). Does not touch product
     * scalar fields, variants, print pricing, or Badge tiers. Admin-only (backend enforced).
     */
    setFixedSizePriceOptions(productId: string, payload: SetProductFixedSizePriceOptionsPayload): Promise<ProductFixedSizePriceOption[]> {
      return client.put(`/api/catalog/products/${productId}/fixed-size-price-options`, payload)
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
