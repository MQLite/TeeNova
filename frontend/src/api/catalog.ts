import { apiClient } from '@/lib/api-client'
import type { PagedResult, Product, ProductListItem } from '@/types'

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
}
