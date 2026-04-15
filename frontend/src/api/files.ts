import { apiClient } from '@/lib/api-client'
import type { AdminAsset, PagedResult, UploadedAsset } from '@/types'

export const filesApi = {
  upload(file: File): Promise<UploadedAsset> {
    return apiClient.uploadFile('/api/files/upload', file)
  },

  getAdminAssets(skipCount = 0, maxResultCount = 100): Promise<PagedResult<AdminAsset>> {
    return apiClient.get(
      `/api/files/assets?skipCount=${skipCount}&maxResultCount=${maxResultCount}`,
    )
  },

  getAdminAssetById(id: string): Promise<AdminAsset> {
    return apiClient.get(`/api/files/assets/${id}`)
  },

  cleanOrphanedAssets(): Promise<{ deletedCount: number; failedCount: number }> {
    return apiClient.post('/api/files/assets/clean-orphans', {})
  },
}
