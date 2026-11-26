export interface SizeRow { colour: string; size: string; quantity: number | null }
export interface GarmentGroup {
  pricingKind?: 'tee' | 'hoodie' | 'kidsTee' | 'kidsHoodie' | 'unlinked' | null
  prints?: {area: string; size: string}[] | null
  heading: string
  presentation: 'rows' | 'matrix'
  rows: SizeRow[]
  notes: string
}
export interface PrintLayout { title: string; groups: GarmentGroup[] }
export interface Worksheet {
  customer: string
  phone: string
  pickupDate: string
  instructions: string
  layout?: PrintLayout | null
  totalPrice?: number | null
  deposit?: number | null
}
export const blankWorksheet: Worksheet = { customer: '', phone: '', pickupDate: '', instructions: '' }
export const todayInAuckland = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

export function hasSheetContent(sheet: Worksheet) {
  return Boolean(sheet.customer.trim() || sheet.phone.trim() || sheet.pickupDate ||
    sheet.instructions.trim() || sheet.layout?.groups.length || sheet.totalPrice != null || sheet.deposit != null)
}
export function missingSheetHeadings(layout?: PrintLayout | null): string[] {
  if (!layout) return []
  const missing = layout.title.trim() ? [] : ['工作单标题']
  layout.groups.forEach((group, index) => {
    if (!group.heading.trim()) missing.push(`第 ${index + 1} 个服装分组的名称`)
  })
  return missing
}

export function totalPieces(rows: SizeRow[]) {
  if (!rows.length || rows.some(row => row.quantity === null)) return null
  return rows.reduce((sum, row) => sum + (row.quantity ?? 0), 0)
}

// Preserve reply order. Fall back to one row per entry if pivoting would lose data or overflow A4.
export function matrixColumns(group: GarmentGroup) {
  if (group.presentation !== 'matrix') return null
  const sizes = [...new Set(group.rows.map(row => row.size))]
  const pairs = new Set(group.rows.map(row => JSON.stringify([row.colour, row.size])))
  return sizes.length <= 6 && sizes.every(s => s.trim()) && pairs.size === group.rows.length ? sizes : null
}
