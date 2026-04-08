import { apiClient } from '@/lib/api-client'
import type { UploadedAsset } from '@/types'

export const filesApi = {
  upload(file: File): Promise<UploadedAsset> {
    return apiClient.uploadFile('/api/files/upload', file)
  },
}
