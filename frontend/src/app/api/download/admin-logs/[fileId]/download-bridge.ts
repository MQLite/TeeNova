export const MAX_ADMIN_LOG_FILE_ID_LENGTH = 2048

export type AdminLogDownloadErrorCode =
  | 'file-unavailable'
  | 'file-expired'
  | 'file-changed'
  | 'file-too-large'
  | 'feature-disabled'
  | 'source-unavailable'
  | 'forbidden'
  | 'session-expired'
  | 'download-failed'

export function isSafeFileId(fileId: string | null | undefined): fileId is string {
  if (!fileId || fileId.length > MAX_ADMIN_LOG_FILE_ID_LENGTH) return false
  return /^[A-Za-z0-9_-]+$/.test(fileId)
}

export function mapDownloadFailure(
  status: number,
  backendCode?: string | null,
): AdminLogDownloadErrorCode {
  if (status === 401) return 'session-expired'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'file-unavailable'
  if (status === 410) return 'file-expired'
  if (status === 409) return 'file-changed'
  if (status === 413) return 'file-too-large'
  if (status === 503 && backendCode === 'TeeNova:AdminLogs:Disabled') return 'feature-disabled'
  if (status === 503) return 'source-unavailable'
  return 'download-failed'
}
