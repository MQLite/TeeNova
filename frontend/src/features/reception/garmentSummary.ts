import type { GarmentGroup, PrintLayout, SizeRow } from './worksheet'

type Audience = '成人' | '童装' | '其他'
const bannerHeading = /\bbanners?\b|横幅|横额|旗帜/i

function audience(group: GarmentGroup): Audience {
  if (group.pricingKind === 'unlinked' || bannerHeading.test(group.heading)) return '其他'
  if (group.pricingKind) {
    return group.pricingKind === 'kidsTee' || group.pricingKind === 'kidsHoodie' ? '童装' : '成人'
  }
  // Older worksheets can name the audience without a catalogue link.
  if (/童|小孩|\b(kids?|youth|children(?:'s)?|child)\b/i.test(group.heading)) return '童装'
  if (/成人|\badults?\b/i.test(group.heading)) return '成人'
  return '其他'
}

type IndexedGroup = {group: GarmentGroup; index: number; label: string}

export function garmentSections(layout?: PrintLayout | null) {
  if (!layout?.groups.some(group => !bannerHeading.test(group.heading) &&
    group.rows.some(row => row.quantity != null || row.colour.trim() || row.size.trim()))) return null
  const buckets: Record<Audience, IndexedGroup[]> = {'成人': [], '童装': [], '其他': []}
  layout.groups.forEach((group, index) => {
    const heading = group.heading.trim()
    const duplicate = layout.groups.some((other, i) => i !== index && other.heading.trim() === heading)
    const label = heading && duplicate ? `${heading}（第 ${index + 1} 组）` : heading || `第 ${index + 1} 组`
    buckets[audience(group)].push({group, index, label})
  })
  return (Object.keys(buckets) as Audience[]).filter(label => buckets[label].length)
    .map(label => ({label, groups: buckets[label]}))
}

export type GarmentSection = NonNullable<ReturnType<typeof garmentSections>>[number]

// Keep source size order and group identities. Ambiguous cells and wide grids use detail rows.
export function garmentSizeMatrix({groups}: GarmentSection) {
  const sizes = new Set<string>()
  const designs = []
  let columnCount = 0
  for (const {group, index, label} of groups) {
    if (!group.rows.length) return null
    const colours = new Map<string, Map<string, SizeRow>>()
    for (const row of group.rows) {
      if (!row.size.trim()) return null
      let cells = colours.get(row.colour)
      if (!cells) {
        cells = new Map<string, SizeRow>()
        colours.set(row.colour, cells)
        if (++columnCount > 6) return null
      }
      if (cells.has(row.size)) return null
      cells.set(row.size, row)
      sizes.add(row.size)
    }
    designs.push({group, index, label, colours: [...colours].map(([colour, cells]) => ({colour, cells}))})
  }
  return {sizes: [...sizes], designs, columnCount}
}

export type SizeMatrix = NonNullable<ReturnType<typeof garmentSizeMatrix>>

function counterpartKey({group}: SizeMatrix['designs'][number], kids: boolean) {
  const audienceLabel = kids ? /^(?:儿童|童装|童款|小童|大童|kids?\b|children(?:'s)?\b|youth\b)\s*/i :
    /^(?:成人|adults?\b)\s*/i
  const design = group.heading.normalize('NFKC').trim().replace(audienceLabel, '')
    .replace(/^[\s|:/-]+/, '').replace(/\s+/g, ' ').toLowerCase()
  const style = {tee: 'tee', kidsTee: 'tee', hoodie: 'hoodie', kidsHoodie: 'hoodie', unlinked: ''}[group.pricingKind ?? 'unlinked']
  return JSON.stringify([style, design])
}

// Reuse columns only when every adult design has exactly one corresponding kids' design.
// Each section still reads from its own source group, including its original heading and notes.
export function alignAudienceMatrices(adults: SizeMatrix, kids: SizeMatrix) {
  const adultKeys = adults.designs.map(design => counterpartKey(design, false))
  const kidsByKey = new Map(kids.designs.map(design => [counterpartKey(design, true), design]))
  if (new Set(adultKeys).size !== adultKeys.length || kidsByKey.size !== kids.designs.length ||
      adultKeys.length !== kidsByKey.size || adultKeys.some(key => !kidsByKey.has(key))) return null
  const adultDesigns = []
  const kidsDesigns = []
  let columnCount = 0
  for (const [i, key] of adultKeys.entries()) {
    const adultDesign = adults.designs[i]
    const kidsDesign = kidsByKey.get(key)!
    const colours = [...new Set([...adultDesign.colours, ...kidsDesign.colours].map(column => column.colour))]
    columnCount += colours.length
    if (columnCount > 6) return null
    const align = (design: typeof adultDesign) => ({...design, colours: colours.map(colour =>
      design.colours.find(column => column.colour === colour) ?? {colour, cells: new Map<string, SizeRow>()})})
    adultDesigns.push(align(adultDesign))
    kidsDesigns.push(align(kidsDesign))
  }
  return [{...adults, designs: adultDesigns, columnCount}, {...kids, designs: kidsDesigns, columnCount}]
}
