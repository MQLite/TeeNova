import { apiClient, type ApiClient } from '@/lib/api-client'
import type {
  BulkSaveProductVariantsPayload,
  PagedResult,
  Product,
  ProductImage,
  ProductListItem,
  ProductVariant,
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

    bulkSaveVariants(productId: string, payload: BulkSaveProductVariantsPayload): Promise<ProductVariant[]> {
      return client.put<ProductVariant[]>(`/api/catalog/products/${productId}/variants/bulk`, payload)
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
