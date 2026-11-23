import { describe, expect, it } from 'vitest'
import { blankWorksheet, hasSheetContent, matrixColumns, totalPieces, type GarmentGroup } from './worksheet'

describe('OpenAI garment worksheets', () => {
  const group: GarmentGroup = { heading: '短袖', presentation: 'matrix', notes: 'B&F',
    rows: [{ colour: '白', size: 'L', quantity: 10 }, { colour: '黑', size: 'M', quantity: 8 }] }
  it('preserves the requested size order and allows printing a table without extra notes', () => {
    expect(matrixColumns(group)).toEqual(['L', 'M'])
    expect(totalPieces(group.rows)).toBe(18)
    expect(hasSheetContent({...blankWorksheet, layout: {title: '队服', groups: [group]}})).toBe(true)
  })
  it('keeps duplicates as separate rows, distinguishes zero and unreadable quantities', () => {
    expect(matrixColumns({...group, rows: [...group.rows, group.rows[0]]})).toBeNull()
    expect(totalPieces([{...group.rows[0], quantity: null}])).toBeNull()
    expect(totalPieces([{...group.rows[0], quantity: 0}])).toBe(0)
  })
  it('still prints saved text-only sheets', () => {
    expect(hasSheetContent({...blankWorksheet, instructions: 'By Friday', layout: null})).toBe(true)
  })
})
