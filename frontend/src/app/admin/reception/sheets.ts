import { adminApiClient } from '@/lib/admin-client'
import type { PrintLayout, Worksheet } from '@/features/reception/worksheet'
import type { Stroke } from './InkPad'
import type { PhotoSource } from '@/features/reception/recognize'

const path = '/api/admin/reception-sheets'
export const stages = { Preparing: '待做好', Ready: '待取货', Collected: '已取货' } as const
export type Stage = keyof typeof stages
export interface SheetSummary { id: string; customer: string; pickupDate: string | null; creationTime: string; totalPrice?: number | null; deposit?: number | null }
export interface SavedSheet extends SheetSummary { phone: string; instructions: string; stage: Stage; layout?: PrintLayout | null; version: string; handwriting?: Stroke[] | null; sourcePhoto?: PhotoSource | null }
export const fetchSheet = (id: string) => adminApiClient.get<SavedSheet>(path + '/' + id)
export const saveSheet = (id: string, sheet: Worksheet, handwriting: Stroke[], version?: string, sourcePhoto?: PhotoSource) =>
  adminApiClient.put<SavedSheet>(path + '/' + id, { ...sheet, pickupDate: sheet.pickupDate || null, handwriting, version, sourcePhoto, replaceSourcePhoto: true })
export const fetchQueue = (stage: Stage, pickupDate: string, search: string, offset: number, signal: AbortSignal) =>
  adminApiClient.get<{ items: SheetSummary[]; hasMore: boolean }>(path, { stage, pickupDate: pickupDate || undefined, search: search || undefined, offset }, { signal })
export const advanceSheet = (id: string, stage: Stage, version: string) =>
  adminApiClient.put<SavedSheet>(path + '/' + id + '/stage', { stage, version })
