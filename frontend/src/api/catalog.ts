import { apiClient } from '@/lib/api-client'
import type { PagedResult, Product, ProductImage, ProductListItem, ProductVariant } from '@/types'

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

export const catalogApi = {
  getProducts(params?: GetProductsParams): Promise<PagedResult<ProductListItem>> {
    return apiClient.get('/api/catalog/products', {
      search: params?.search,
      productType: params?.productType,
      isActive: params?.isActive,
      skipCount: params?.skipCount ?? 0,
      maxResultCount: params?.maxResultCount ?? 20,
    })
  },

  getProduct(id: string): Promise<Product> {
    return apiClient.get(`/api/catalog/products/${id}`)
  },

  createProduct(payload: CreateProductPayload): Promise<Product> {
    return apiClient.post('/api/catalog/products', payload)
  },

  updateProduct(id: string, payload: UpdateProductPayload): Promise<Product> {
    return apiClient.put(`/api/catalog/products/${id}`, payload)
  },

  updateProductStatus(id: string, isActive: boolean): Promise<Product> {
    return apiClient.put(`/api/catalog/products/${id}/status`, { isActive })
  },

  createVariant(productId: string, payload: CreateVariantPayload): Promise<ProductVariant> {
    return apiClient.post(`/api/catalog/products/${productId}/variants`, payload)
  },

  updateVariant(productId: string, variantId: string, payload: UpdateVariantPayload): Promise<ProductVariant> {
    return apiClient.put(`/api/catalog/products/${productId}/variants/${variantId}`, payload)
  },

  deleteVariant(productId: string, variantId: string): Promise<void> {
    return apiClient.delete(`/api/catalog/products/${productId}/variants/${variantId}`)
  },

  uploadProductImage(productId: string, file: File): Promise<ProductImage> {
    return apiClient.uploadFile(`/api/catalog/products/${productId}/images/upload`, file)
  },

  updateProductImage(productId: string, imageId: string, payload: UpdateProductImagePayload): Promise<ProductImage> {
    return apiClient.put(`/api/catalog/products/${productId}/images/${imageId}`, payload)
  },

  setPrimaryProductImage(productId: string, imageId: string): Promise<void> {
    return apiClient.put(`/api/catalog/products/${productId}/images/${imageId}/primary`)
  },

  deleteProductImage(productId: string, imageId: string): Promise<void> {
    return apiClient.delete(`/api/catalog/products/${productId}/images/${imageId}`)
  },
}
