import { apiClient } from '@/lib/api-client'
import type { PagedResult, Product, ProductListItem } from '@/types'

interface GetProductsParams {
  search?: string
  productType?: string
  isActive?: boolean
  skipCount?: number
  maxResultCount?: number
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
}
