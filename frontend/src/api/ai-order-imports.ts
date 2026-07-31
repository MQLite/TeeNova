import { adminApiClient } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'

export type AiOrderImportStatus =
  | 'Uploaded'
  | 'Processing'
  | 'NeedsReview'
  | 'Draft'
  | 'Confirmed'
  | 'Failed'
  | 'Cancelled'

export interface AiOrderSourceWarning {
  code: string
  message: string
}

export interface AiOrderSourceDocument {
  id: string
  sequence: number
  captureMethod: 'Camera' | 'Upload'
  originalFileName?: string
  contentType: string
  byteSize: number
  pageCount?: number
  imageWidth?: number
  imageHeight?: number
  rotationDegrees: number
  uploadedAt: string
  warnings: AiOrderSourceWarning[]
}

export interface AiOrderImportSummary {
  id: string
  status: AiOrderImportStatus
  currentRevision: number
  creationTime: string
  sourceDocumentCount: number
  canModifyDocuments: boolean
  recognition?: AiOrderRecognitionStatus
}

export interface AiOrderRecognitionStatus {
  attemptId: string
  attemptNumber: number
  provider: string
  model: string
  outcome: 'Processing' | 'Succeeded' | 'RetryableFailure' | 'PermanentFailure' | 'Cancelled'
  submittedAt: string
  completedAt?: string
  safeErrorCode?: string
  isRetryable?: boolean
  nextRetryAt?: string
  inputTokens?: number
  outputTokens?: number
  estimatedCostUsd?: number
  actualCostUsd?: number
}

export interface AiOrderRecognitionModelOption {
  id: string
  displayName: string
  supportsImages: boolean
  supportsPdf: boolean
}

export interface AiOrderRecognitionProviderOption {
  id: string
  displayName: string
  models: AiOrderRecognitionModelOption[]
}

export interface AiOrderRecognitionOptions {
  recognitionEnabled: boolean
  providers: AiOrderRecognitionProviderOption[]
}

export interface AiOrderImport extends AiOrderImportSummary {
  sourceDocuments: AiOrderSourceDocument[]
  canContinueToRecognition: boolean
}

export interface AiOrderSourceUploadResult {
  document: AiOrderSourceDocument
  wasIdempotentReplay: boolean
  possibleMatchingImportIds: string[]
}

export type AiOrderReviewDecision =
  | 'Unresolved'
  | 'Accepted'
  | 'Corrected'
  | 'Cleared'
  | 'Confirmed'

export interface AiOrderReviewField<T> {
  sourceValue: T | null
  normalizedValue: T | null
  staffValue: T | null
  decision: AiOrderReviewDecision
  sourceText?: string | null
  confidence?: number | null
  sourceRefs: AiOrderSourceReference[]
  reason?: string | null
  cleared: boolean
  unresolved: boolean
}

export interface AiOrderSourceReference {
  sourceDocumentId: string
  page?: number
  region?: number[]
}

export interface AiOrderControlledValue {
  kind: 'Named' | 'NotApplicable' | 'Catalogue' | 'OneSize' | 'Custom'
  label: string
}

export interface AiOrderProductCandidate {
  productId: string
  productName: string
  productKind: string
  pricingModel: string
  score: number
  matchKind?: string
  recommendation?: string
  active: boolean
  reasons: string[]
  warnings?: string[]
}

export interface AiOrderCompatibleVariant {
  productVariantId: string
  sku: string
  colour: string
  size: string
  available: boolean
}

export interface AiOrderAdHocProduct {
  adHocProductId?: string
  displayName?: string | null
  brand?: string | null
  supplierName?: string | null
  supplierCode?: string | null
  supplySource?: string | null
  inventoryBehavior: 'NotTracked'
  confirmed: boolean
  acknowledgedOrderOnly: boolean
  reason?: string | null
}

export interface AiOrderProductSelection {
  mode: 'Unresolved' | 'Catalogue' | 'AdHoc'
  selectedCatalogueProduct?: {
    productId: string
    productName: string
    productKind: string
    pricingModel: string
    active: boolean
  } | null
  adHocProduct?: AiOrderAdHocProduct | null
  productCandidates: AiOrderProductCandidate[]
  reason?: string | null
}

export interface AiOrderReviewPrint {
  printId: string
  position: AiOrderReviewField<string>
  printSize: AiOrderReviewField<string>
  notes: AiOrderReviewField<string>
}

export interface AiOrderReviewSizeRow {
  rowId: string
  size: AiOrderReviewField<AiOrderControlledValue>
  quantity: AiOrderReviewField<number>
  confirmedProductVariantId?: string | null
  compatibleVariants: AiOrderCompatibleVariant[]
  variantCandidatesByProduct?: Array<{
    productId: string
    variants: AiOrderCompatibleVariant[]
  }>
  sourceEvidence?: unknown[]
}

export interface AiOrderReviewProductGroup {
  groupId: string
  writtenProductName: AiOrderReviewField<string>
  productSelection: AiOrderProductSelection
  colour: AiOrderReviewField<AiOrderControlledValue>
  supplySource: AiOrderReviewField<string>
  artworkIdentity: AiOrderReviewField<string>
  artworkDescription: AiOrderReviewField<string>
  productionNotes: AiOrderReviewField<string>
  printing: AiOrderReviewPrint[]
  sizeQuantityRows: AiOrderReviewSizeRow[]
  sourceEvidence?: unknown[]
}

export interface AiOrderReviewIssue {
  issueId: string
  code: string
  category: 'MissingRequired' | 'NeedsConfirmation' | 'Conflict'
  severity: 'Blocking' | 'Warning'
  paths: string[]
  message: string
  observedValues?: string[]
  sourceRefs?: AiOrderSourceReference[]
  resolution: {
    status: 'Open' | 'Resolved' | 'AcceptedWarning'
    decision?: string
    reason?: string
  }
}

export interface AiOrderConfirmationReadiness {
  readyToConfirm: boolean
  blockingIssueCount: number
  catalogueSelectionsCurrent: boolean
  message: string
  confirmationOwnedBy: 'Jira 10207'
  confirmOrderEnabled: false
}

export interface AiOrderReview {
  importId: string
  status: AiOrderImportStatus
  currentRevision: number
  baseRevision: number
  reviewVersion: 'ai-order-staff-review-v1'
  hasStaffRevision: boolean
  validationRevision: number
  validationRevisionId: string
  validationVersion: string
  sourceAiRevision: number
  canonicalSha256: string
  catalogueValidationStatus: 'Current' | 'Stale'
  catalogueValidatedAt: string
  requiresRevalidation: boolean
  issueCount: number
  blockingIssueCount: number
  warningCount: number
  customer: {
    name: AiOrderReviewField<string>
    phone: AiOrderReviewField<string>
    email: AiOrderReviewField<string>
    organisation: AiOrderReviewField<string>
    addressOrFulfilmentNotes: AiOrderReviewField<string>
  }
  productGroups: AiOrderReviewProductGroup[]
  financials: {
    orderTotal: AiOrderReviewField<string> & { currency: 'NZD' }
    depositPaid: AiOrderReviewField<string> & { currency: 'NZD' }
    writtenBalance?: unknown
    balanceDue?: { currency: 'NZD'; amount: string } | null
    derivationStatus: 'Complete' | 'Incomplete' | 'Invalid'
  }
  issues: AiOrderReviewIssue[]
  issueResolutions: Array<{ issueId: string; decision: string; reason?: string }>
  confirmationReadiness: AiOrderConfirmationReadiness
  lastSavedAt?: string
}

export interface AiOrderReviewSaveInput {
  expectedRevision: number
  reviewVersion: 'ai-order-staff-review-v1'
  customer: {
    name: AiOrderReviewTextInput
    phone: AiOrderReviewTextInput
    email: AiOrderReviewTextInput
    organisation: AiOrderReviewTextInput
    addressOrFulfilmentNotes: AiOrderReviewTextInput
  }
  productGroups: AiOrderReviewProductGroupInput[]
  financials: {
    orderTotal: AiOrderReviewMoneyInput
    depositPaid: AiOrderReviewMoneyInput
  }
  issueResolutions: Array<{ issueId: string; decision: string; reason?: string }>
  operations: AiOrderReviewOperationInput[]
}

export interface AiOrderReviewTextInput {
  staffValue?: string | null
  decision: AiOrderReviewDecision
  reason?: string | null
}

export type AiOrderReviewMoneyInput = AiOrderReviewTextInput

export interface AiOrderReviewProductGroupInput {
  groupId: string
  writtenProductName: AiOrderReviewTextInput
  productSelection: {
    mode: 'Unresolved' | 'Catalogue' | 'AdHoc'
    catalogueProductId?: string | null
    reason?: string | null
    adHocProduct?: {
      displayName?: string | null
      brand?: string | null
      supplierName?: string | null
      supplierCode?: string | null
      supplySource?: string | null
      confirmed: boolean
      acknowledgedOrderOnly: boolean
      reason?: string | null
    } | null
  }
  colour: AiOrderReviewControlledInput
  supplySource: AiOrderReviewTextInput
  artworkIdentity: AiOrderReviewTextInput
  artworkDescription: AiOrderReviewTextInput
  productionNotes: AiOrderReviewTextInput
  printing: Array<{
    printId: string
    position: AiOrderReviewTextInput
    printSize: AiOrderReviewTextInput
    notes: AiOrderReviewTextInput
  }>
  sizeQuantityRows: Array<{
    rowId: string
    size: AiOrderReviewControlledInput
    quantity?: number | null
    quantityDecision: AiOrderReviewDecision
    quantityReason?: string | null
    confirmedProductVariantId?: string | null
  }>
}

export interface AiOrderReviewControlledInput {
  kind?: string | null
  label?: string | null
  decision: AiOrderReviewDecision
  reason?: string | null
}

export interface AiOrderReviewOperationInput {
  action:
    | 'GroupAdded'
    | 'GroupRemoved'
    | 'GroupMerged'
    | 'GroupSplit'
    | 'GroupDuplicated'
    | 'GroupReordered'
    | 'RowAdded'
    | 'RowRemoved'
    | 'RowMerged'
  path?: string
  sourceIds: string[]
  resultIds: string[]
  reason?: string
}

export interface AiOrderCatalogueSearchItem {
  productId: string
  productName: string
  productKind: string
  pricingModel: string
  isActive: boolean
  matchKind: string
  variants: Array<{
    productVariantId: string
    sku: string
    colour: string
    size: string
    isAvailable: boolean
  }>
}

export async function createAiOrderImport(
  idempotencyKey: string,
  captureSessionId: string,
): Promise<AiOrderImport> {
  const response = await fetch('/api/proxy/api/admin/ai-order-imports', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ captureSessionId }),
  })
  if (!response.ok) throw await toApiError(response)
  return response.json() as Promise<AiOrderImport>
}

export async function listAiOrderImports(): Promise<AiOrderImportSummary[]> {
  const result = await adminApiClient.get<{ items: AiOrderImportSummary[] }>(
    '/api/admin/ai-order-imports',
  )
  return result.items
}

export function getAiOrderImport(id: string): Promise<AiOrderImport> {
  return adminApiClient.get(`/api/admin/ai-order-imports/${id}`)
}

export function getAiOrderReview(id: string): Promise<AiOrderReview> {
  return adminApiClient.get(`/api/admin/ai-order-imports/${id}/review`)
}

export function saveAiOrderReview(
  id: string,
  input: AiOrderReviewSaveInput,
): Promise<AiOrderReview> {
  return adminApiClient.put(`/api/admin/ai-order-imports/${id}/review`, input)
}

export async function searchAiOrderCatalogue(
  id: string,
  query: string,
): Promise<AiOrderCatalogueSearchItem[]> {
  const result = await adminApiClient.get<{ items: AiOrderCatalogueSearchItem[] }>(
    `/api/admin/ai-order-imports/${id}/review/catalogue`,
    { query },
  )
  return result.items
}

export function getAiOrderRecognitionOptions(): Promise<AiOrderRecognitionOptions> {
  return adminApiClient.get('/api/admin/ai-order-imports/recognition-options')
}

export function startAiOrderRecognition(
  importId: string,
  provider: string,
  model: string,
  idempotencyKey: string,
  retry = false,
): Promise<AiOrderRecognitionStatus> {
  return recognitionPost(
    `/api/proxy/api/admin/ai-order-imports/${importId}/recognition${retry ? '/retry' : ''}`,
    { provider, model },
    idempotencyKey,
  )
}

export function reorderAiOrderSources(importId: string, documentIds: string[]): Promise<void> {
  return adminApiClient.put(
    `/api/admin/ai-order-imports/${importId}/documents/order`,
    { documentIds },
  )
}

export function setAiOrderSourceRotation(
  importId: string,
  documentId: string,
  rotationDegrees: number,
): Promise<void> {
  return adminApiClient.put(
    `/api/admin/ai-order-imports/${importId}/documents/${documentId}/rotation`,
    { rotationDegrees },
  )
}

export function removeAiOrderSource(importId: string, documentId: string): Promise<void> {
  return adminApiClient.delete(
    `/api/admin/ai-order-imports/${importId}/documents/${documentId}`,
  )
}

export function cancelAiOrderImport(importId: string): Promise<void> {
  return adminApiClient.post(`/api/admin/ai-order-imports/${importId}/cancel`)
}

export function sourceContentUrl(importId: string, documentId: string): string {
  return `/api/admin/ai-order-imports/${importId}/documents/${documentId}/content`
}

export function uploadAiOrderSource(
  importId: string,
  file: File,
  captureMethod: 'Camera' | 'Upload',
  uploadIdempotencyKey: string,
  onProgress: (percentage: number) => void,
): Promise<AiOrderSourceUploadResult> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', `/api/proxy/api/admin/ai-order-imports/${importId}/documents`)
    request.setRequestHeader('Upload-Idempotency-Key', uploadIdempotencyKey)
    request.responseType = 'json'
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      }
    }
    request.onerror = () => reject(new ApiError(0, 'Upload failed. Check your connection and retry.'))
    request.onload = () => {
      const body = request.response
      if (request.status >= 200 && request.status < 300) {
        onProgress(100)
        resolve(body as AiOrderSourceUploadResult)
        return
      }
      const message =
        body?.error?.message ??
        body?.message ??
        `Upload failed with HTTP ${request.status}`
      reject(new ApiError(request.status, message, body))
    }

    const form = new FormData()
    form.append('file', file)
    form.append('captureMethod', captureMethod)
    request.send(form)
  })
}

async function toApiError(response: Response): Promise<ApiError> {
  let details: unknown
  try {
    details = await response.json()
  } catch {
    details = undefined
  }
  const body = details as { error?: { message?: string }; message?: string } | undefined
  return new ApiError(
    response.status,
    body?.error?.message ?? body?.message ?? `HTTP ${response.status}`,
    details,
  )
}

async function recognitionPost(
  url: string,
  body: { provider: string; model: string },
  idempotencyKey: string,
): Promise<AiOrderRecognitionStatus> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await toApiError(response)
  return response.json() as Promise<AiOrderRecognitionStatus>
}
