import type { RecognitionSourceNote } from './materials'
import type { GarmentGroup, SizeRow, Worksheet } from './worksheet'

export type QuantityReview = {
  key: string
  heading: string
  colour: string
  size: string
  occurrence?: number
  current: number | null
  proposed: number | null
  initiallyAccepted: boolean
}

const normalize = (value: string) => value.normalize('NFKC').trim().toLowerCase()
function locateRows(groups: GarmentGroup[]) {
  const seen = new Map<string, number>()
  return groups.map(group => group.rows.map(row => {
    const identity = JSON.stringify([group.heading, row.colour, row.size].map(normalize))
    const occurrence = (seen.get(identity) ?? 0) + 1
    seen.set(identity, occurrence)
    return { group, row, identity, occurrence, key: JSON.stringify([identity, occurrence]) }
  }))
}

type LocatedRow = ReturnType<typeof locateRows>[number][number]

const colourAliases: Record<string, string[]> = {
  black: ['黑', '黑色'], white: ['白', '白色'], blue: ['蓝', '蓝色'],
  red: ['红', '红色'], grey: ['gray', '灰', '灰色'], navy: ['藏青', '海军蓝'],
}

function mentions(text: string, value: string, size = false) {
  if (!value) return false
  const token = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (size && /^\d+$/.test(value)) return new RegExp(`(?:尺码|size)[ :]*${token}(?![0-9])|(?<![0-9])${token}[ ]*[码号]`).test(text)
  if (/[\u3400-\u9fff]/.test(value)) return text.includes(value)
  return new RegExp(`(?<![a-z0-9])${token}(?![a-z0-9])`).test(text)
}

function colourMentioned(text: string, value: string) {
  const colour = normalize(value)
  const aliases = Object.entries(colourAliases).find(([key, names]) => key === colour || names.includes(colour))
  return (aliases ? [aliases[0], ...aliases[1]] : [colour]).some(name => mentions(text, name))
}

function matchesNote(note: RecognitionSourceNote, rows: LocatedRow[]) {
  const evidence = [note.field, note.message, ...note.references.map(reference => reference.quote ?? '')].map(normalize)
  const label = evidence[0]
  const detail = evidence.slice(1).join(' ')
  const direct = rows.filter(({ row }) => mentions(label, normalize(row.size), true))
  let sizes = direct.length ? direct : rows.filter(({ row }) => mentions(detail, normalize(row.size), true))
  for (const context of [label, detail]) {
    if (sizes.length <= 1) break
    const garments = sizes.filter(({ group }) => mentions(context, normalize(group.heading)))
    if (garments.length) sizes = garments
    const colours = sizes.filter(({ row }) => colourMentioned(context, row.colour))
    if (colours.length) sizes = colours
  }
  return sizes
}

export function isQuantityNote(note: RecognitionSourceNote) {
  const isQuantity = /quantity|qty|count|pieces?|数量|件数|码数/i
  return note.kind === 'possibleDuplicate' || isQuantity.test(note.field) ||
    (/size|尺码|码/i.test(note.field) && isQuantity.test(note.message))
}

export function prepareQuantityReview(current: Worksheet, incoming: Worksheet, notes: RecognitionSourceNote[], reviewMissing: boolean) {
  const existing = locateRows(current.layout?.groups ?? []).flat()
  const incomingRows = locateRows(incoming.layout?.groups ?? []).flat()
  const existingByKey = new Map(existing.map(row => [row.key, row]))
  const incomingByKey = new Map(incomingRows.map(row => [row.key, row]))
  const duplicateIdentities = new Set([...existing, ...incomingRows].filter(row => row.occurrence > 1).map(row => row.identity))
  const incomingDuplicates = new Set(incomingRows.filter(row => row.occurrence > 1).map(row => row.identity))
  const quantities = new Map<string, QuantityReview>()
  let locationUnknown = false
  function offer(location: LocatedRow, current: number | null, proposed: number | null, initiallyAccepted = false) {
    const { group, row, key, identity, occurrence } = location
    quantities.set(key, { key, heading: group.heading, colour: row.colour, size: row.size,
      occurrence: duplicateIdentities.has(identity) ? occurrence : undefined, current, proposed, initiallyAccepted })
  }
  for (const location of existing) {
    const previous = location.row.quantity
    const next = incomingByKey.get(location.key)?.row.quantity ?? null
    if (previous !== next && (next !== null || reviewMissing)) offer(location, previous, next)
  }
  // Conflicts win when a correction and an unresolved note point at the same row.
  const orderedNotes = [...notes.filter(note => note.kind === 'correction'), ...notes.filter(note => note.kind !== 'correction')]
  for (const note of orderedNotes) {
    let matches = matchesNote(note, incomingRows)
    if (note.kind === 'possibleDuplicate') {
      const duplicates = (matches.length ? matches : incomingRows).filter(row => incomingDuplicates.has(row.identity))
      if (duplicates.length) matches = duplicates
    }
    if (!matches.length || new Set(matches.map(row => row.identity)).size > 1) locationUnknown = true
    if (note.kind === 'correction' && matches.length !== 1) continue
    for (const location of matches) {
      const previous = existingByKey.get(location.key)
      const currentQuantity = previous?.row.quantity ?? null
      const proposed = location.row.quantity
      if (!previous || currentQuantity !== proposed) {
        offer(previous ?? location, currentQuantity, proposed, note.kind === 'correction' && currentQuantity === null)
      }
    }
  }
  // Compare group structure with held quantities so quantity-only changes use just the row choices.
  const held = new Map([...quantities.values()].map(choice => [choice.key, choice.current]))
  return { incoming: withQuantities(incoming, held), quantities: [...quantities.values()], locationUnknown }
}

function withQuantities(sheet: Worksheet, quantities: ReadonlyMap<string, number | null>) {
  if (!sheet.layout || !quantities.size) return sheet
  const { layout } = sheet
  const groups = locateRows(layout.groups).map((rows, index) => ({ ...layout.groups[index], rows: rows.map(({ key, row }) => {
    const quantity = quantities.get(key)
    return quantity === undefined ? row : { ...row, quantity }
  }) }))
  return { ...sheet, layout: { ...layout, groups } }
}

export function applyQuantityReview(sheet: Worksheet, quantities: QuantityReview[], accepted: ReadonlySet<string>) {
  const chosen = new Map(quantities.map(choice => [choice.key, accepted.has(choice.key) ? choice.proposed : choice.current]))
  return withQuantities(sheet, chosen)
}
