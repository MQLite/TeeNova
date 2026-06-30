import type { BannerDetail, BannerDimensionUnit, BannerMaterial } from '@/types'

/** Mirrors the backend BannerDetailFormatter (Jira 9514) so Banner detail reads identically everywhere. */

const MATERIAL_LABEL: Record<BannerMaterial, string> = {
  PullUp: 'Pull-up', Pvc: 'PVC', Mesh: 'Mesh', Fabric: 'Fabric', Other: 'Other',
}

export function unitLabel(unit?: BannerDimensionUnit | null): string {
  switch (unit) {
    case 'Mm': return 'mm'
    case 'Cm': return 'cm'
    case 'M': return 'm'
    default: return ''
  }
}

/** "850×2000 mm (1.7 m²)" for custom sizes, the preset label otherwise, or "—". */
export function bannerSizeSummary(d: BannerDetail): string {
  if (d.sizeMode === 'Custom' && d.width && d.height && d.width > 0 && d.height > 0) {
    const u = unitLabel(d.unit)
    const area = d.areaSquareMetres && d.areaSquareMetres > 0 ? ` (${d.areaSquareMetres} m²)` : ''
    return `${d.width}×${d.height}${u ? ` ${u}` : ''}${area}`
  }
  return d.sizeLabel?.trim() || '—'
}

/** Friendly material name; the free-text name when material is Other. */
export function bannerMaterialSummary(d: BannerDetail): string {
  if (d.material === 'Other' && d.materialDisplayName?.trim()) return d.materialDisplayName.trim()
  return MATERIAL_LABEL[d.material] ?? d.material
}

/** Comma-joined finishing/stand options, or "None". */
export function bannerFinishingSummary(d: BannerDetail): string {
  const parts: string[] = []
  if (d.finishingEyelets) parts.push('Eyelets')
  if (d.finishingHemming) parts.push('Hemming')
  if (d.finishingPolePocket) parts.push('Pole pocket')
  if (d.standIncluded) parts.push('Stand included')
  if (d.standReplacementOnly) parts.push('Stand replacement only')
  if (d.finishingOther?.trim()) parts.push(d.finishingOther.trim())
  return parts.length > 0 ? parts.join(', ') : 'None'
}
