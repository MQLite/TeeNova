import { expect, it } from 'vitest'
import { blankWorksheet, type GarmentGroup } from './worksheet'
import { mergeRecognition } from './mergeRecognition'

const group: GarmentGroup = { heading: '童装', presentation: 'matrix', notes: '左袖绣字',
  rows: [{ colour: '白', size: 'M', quantity: 2 }], prints: [{ area: 'LEFT_SLEEVE', size: 'A5' }] }
const current = { ...blankWorksheet, layout: { title: '队服', groups: [group] } }

it('keeps existing garment details when recognition omits them and lets operators decide title and groups separately', () => {
  const empty = { ...blankWorksheet, layout: { title: '', groups: [] } }
  expect(mergeRecognition(current, empty)).toEqual({ sheet: current, differences: [] })
  const incoming = { ...blankWorksheet, layout: { title: '校队', groups: [{ ...group, notes: '左胸绣字' }] } }
  const review = mergeRecognition(current, incoming)
  expect(review.differences.map(d => d.field)).toEqual(['title', 'groups'])
  expect(review.sheet.layout).toEqual(current.layout)
  expect(mergeRecognition(current, incoming, new Set(['groups'])).sheet.layout)
    .toEqual({ title: '队服', groups: incoming.layout.groups })
})

it('does not ask staff to reconcile JSON property order on a reopened worksheet', () => {
  const equivalent = { ...blankWorksheet, layout: { title: '队服', groups: [{
    prints: group.prints, rows: group.rows, heading: group.heading, notes: group.notes, presentation: group.presentation,
  }] } }
  expect(mergeRecognition(current, equivalent).differences).toEqual([])
})
