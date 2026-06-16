import { apiClient, type ApiClient } from '@/lib/api-client'
import type { AdminAsset, PagedResult, UploadedAsset } from '@/types'

export function makeFilesApi(client: ApiClient) {
  return {
    upload(file: File): Promise<UploadedAsset> {
      return client.uploadFile<UploadedAsset>('/api/files/upload', file)
    },

    getAdminAssets(skipCount = 0, maxResultCount = 100): Promise<PagedResult<AdminAsset>> {
      return client.get(
        `/api/files/assets?skipCount=${skipCount}&maxResultCount=${maxResultCount}`,
      )
    },

    getAdminAssetById(id: string): Promise<AdminAsset> {
      return client.get(`/api/files/assets/${id}`)
    },

    cleanOrphanedAssets(): Promise<{ deletedCount: number; failedCount: number }> {
      return client.post('/api/files/assets/clean-orphans', {})
    },
  }
}

export const filesApi = makeFilesApi(apiClient)
