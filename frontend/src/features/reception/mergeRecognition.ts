import type { GarmentGroup, Worksheet } from './worksheet'

export const recognitionLabels = {
  customer: '客户姓名', phone: '联系电话', pickupDate: '预计可取日期', instructions: '制作说明',
  totalPrice: '总价（NZD）', deposit: '订金（NZD）', title: '工作单标题', groups: '服装分组明细',
}
export type RecognitionField = keyof typeof recognitionLabels
type FieldValue = string | number | GarmentGroup[] | null | undefined
export interface RecognitionDifference {
  field: RecognitionField
  current: FieldValue
  incoming: FieldValue
}

export const emptyRecognitionValue = (value: FieldValue) => comparable(value) === undefined

function comparable(value: FieldValue) {
  if (Array.isArray(value)) {
    if (!value.length) return undefined
    // Stored and recognized JSON can contain identical properties in different orders.
    return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
  }
  if (typeof value === 'string') return value.trim() || undefined
  return value ?? undefined
}

export function mergeRecognition(current: Worksheet, incoming: Worksheet,
    accepted: ReadonlySet<RecognitionField> = new Set(), reviewMissing = false, reviewFields?: ReadonlySet<RecognitionField>) {
  const differences: RecognitionDifference[] = []
  function choose<T extends FieldValue>(field: RecognitionField, existing: T, recognized: T): T {
    const next = comparable(recognized)
    if (next === undefined && !reviewMissing) return existing
    const previous = comparable(existing)
    if (previous === next) return existing
    if (previous === undefined && !reviewFields?.has(field)) return recognized
    differences.push({ field, current: existing, incoming: recognized })
    return accepted.has(field) ? recognized : existing
  }
  const sheet: Worksheet = {
    customer: choose('customer', current.customer, incoming.customer),
    phone: choose('phone', current.phone, incoming.phone),
    pickupDate: choose('pickupDate', current.pickupDate, incoming.pickupDate),
    instructions: choose('instructions', current.instructions, incoming.instructions),
    totalPrice: choose('totalPrice', current.totalPrice, incoming.totalPrice),
    deposit: choose('deposit', current.deposit, incoming.deposit),
    layout: current.layout,
  }
  if (incoming.layout) {
    sheet.layout = {
      title: choose('title', current.layout?.title ?? '', incoming.layout.title),
      groups: choose('groups', current.layout?.groups ?? [], incoming.layout.groups),
    }
  }
  return { sheet, differences }
}
