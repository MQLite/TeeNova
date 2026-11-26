import { adminApiClient } from '@/lib/admin-client'
import type { PrintLayout, Worksheet, WorksheetPayment } from '@/features/reception/worksheet'
import type { Artwork } from './ArtworkPreview'
import type { Stroke } from './InkPad'
import type { PhotoSource } from '@/features/reception/recognize'
import type { MaterialSource, SavedMaterials } from '@/features/reception/materials'

const path = '/api/admin/reception-sheets'
export const stages = { Preparing: '待做好', Ready: '待取货', Collected: '已取货' } as const
export type Stage = keyof typeof stages
export interface SheetSummary { artwork?: Artwork[]; id: string; customer: string; phone?: string; pickupDate: string | null; creationTime: string; totalPrice?: number | null; deposit?: number | null; payments?: WorksheetPayment[] }
export interface SavedSheet extends SheetSummary { phone: string; instructions: string; stage: Stage; layout?: PrintLayout | null; version: string; handwriting?: Stroke[] | null; sourcePhoto?: PhotoSource | null; sourceText?: PhotoSource | null; hasMessengerTrialArtwork?: boolean; hasGmailTrialPdf?: boolean; printEstimate?: string | null; materials?: SavedMaterials | null }
export const deleteSheet = (id: string, version: string) =>
  adminApiClient.delete<void>(path + '/' + id + '?version=' + encodeURIComponent(version))
export const fetchSheet = (id: string) => adminApiClient.get<SavedSheet>(path + '/' + id)
export const saveSheet = (id: string, sheet: Worksheet & { printEstimate?: string; materials?: MaterialSource | null; replaceMaterials?: boolean }, handwriting: Stroke[], version?: string, sourcePhoto?: PhotoSource, sourceText?: PhotoSource) =>
  adminApiClient.put<SavedSheet>(path + '/' + id, { ...sheet, pickupDate: sheet.pickupDate || null, handwriting, version,
    sourcePhoto, replaceSourcePhoto: true, sourceText, replaceSourceText: sourceText !== undefined })
export const fetchQueue = (stage: Stage, pickupDate: string, search: string, offset: number, signal: AbortSignal) =>
  adminApiClient.get<{ items: SheetSummary[]; hasMore: boolean }>(path, { stage, pickupDate: pickupDate || undefined, search: search || undefined, offset }, { signal })
export const advanceSheet = (id: string, stage: Stage, version: string) =>
  adminApiClient.put<SavedSheet>(path + '/' + id + '/stage', { stage, version, manualAdjustment: true })

export type SheetPdf = { id: string; version: string; pages: number; createdAt: string; isCurrent: boolean }

const pdfPath = (id: string) => `${path}/${encodeURIComponent(id)}/pdfs`
export const fetchSheetPdfs = (id: string, signal: AbortSignal) =>
  adminApiClient.get<SheetPdf[]>(pdfPath(id), undefined, { signal })
export const generateSheetPdf = (id: string, version: string) =>
  adminApiClient.post<SheetPdf>(pdfPath(id), { version })
export const sheetPdfUrl = (id: string, pdfId: string, download = false) =>
  `/api/proxy${pdfPath(id)}/${encodeURIComponent(pdfId)}${download ? '?download=true' : ''}`
