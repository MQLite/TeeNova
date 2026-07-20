export const ADMIN_LOG_DOWNLOAD_MESSAGES = {
  'file-unavailable': 'The log file is no longer available. Refresh the list and try again.',
  'file-expired': 'The download link expired. Refresh the list and try again.',
  'file-changed': 'The log file changed after the list was loaded. Refresh the list and try again.',
  'file-too-large': 'This log file exceeds the server download limit.',
  'feature-disabled': 'Server log downloads are currently disabled.',
  'source-unavailable': 'The server log source is temporarily unavailable. Refresh and try again.',
  forbidden: 'You need the Admin role to download server logs.',
  'download-failed': 'The download could not be started. Refresh the list and try again.',
} as const

export type AdminLogDownloadPageError = keyof typeof ADMIN_LOG_DOWNLOAD_MESSAGES | 'session-expired'

export function normalizeAdminLogDownloadError(
  value: string | string[] | undefined,
): AdminLogDownloadPageError | undefined {
  const candidate = Array.isArray(value) ? value[0] : value
  if (candidate === 'session-expired') return candidate
  return candidate && candidate in ADMIN_LOG_DOWNLOAD_MESSAGES
    ? candidate as keyof typeof ADMIN_LOG_DOWNLOAD_MESSAGES
    : undefined
}
