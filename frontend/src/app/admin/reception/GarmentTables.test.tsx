import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { blankWorksheet, type GarmentGroup, type PrintLayout } from '@/features/reception/worksheet'
import { GarmentTables } from './GarmentTables'
import { PrintSheet } from './PrintSheet'

const adult: GarmentGroup = {heading: '成人 T恤 | White 图案', pricingKind: 'tee', presentation: 'matrix',
  notes: '胸前图案', prints: [{area: 'FRONT_CENTER', size: 'A3'}],
  rows: [{colour: 'Pink', size: '5XL', quantity: 1}, {colour: 'Purple', size: '3XL', quantity: 4}]}
const child: GarmentGroup = {...adult, heading: '童装 T恤 | White 图案', pricingKind: 'kidsTee',
  rows: [{colour: 'Pink', size: '12K', quantity: 2}]}
const orange: GarmentGroup = {...adult, heading: '成人 T恤 | Orange 图案',
  rows: [{colour: 'Pink', size: '5XL', quantity: 3}, {colour: 'Pink', size: '3XL', quantity: 0}]}
const layout: PrintLayout = {title: '服装订单', groups: [child, adult, orange]}

function rowValues(table: HTMLElement, label: string) {
  const header = within(table).getByRole('rowheader', {name: label})
  return within(header.closest('tr')!).getAllByRole('cell').map(cell => cell.textContent?.trim())
}

it.each([
  {groups: [adult, orange], subtotal: '成人小计', total: '8'},
  {groups: [child], subtotal: '童装小计', total: '2'},
  {groups: [{...child, heading: '短袖', pricingKind: undefined}], subtotal: '其他小计', total: '2'},
])('prints one combined list with $subtotal for a single audience', ({groups, subtotal, total}) => {
  render(<PrintSheet sheet={{...blankWorksheet, layout: {...layout, groups}}} received="2026-11-26" estimate="待核"/>)
  const table = screen.getByRole('table', {name: '服装数量明细（件）'})
  expect(rowValues(table, subtotal).at(-1)).toBe(total)
  expect(rowValues(table, '整单合计').at(-1)).toBe(total)
})

it('omits the combined table for a text-only worksheet', () => {
  render(<GarmentTables layout={{title: '备注', groups: []}}/>)
  expect(screen.queryByRole('table')).toBeNull()
})

it('prints adults and kids together with separate garment colours, designs, size totals and group notes', () => {
  render(<PrintSheet sheet={{...blankWorksheet, layout}} received="2026-11-26" estimate="待核"/>)
  const table = screen.getByRole('table', {name: '服装数量明细（件）'})
  expect(screen.getAllByRole('table')).toHaveLength(1)
  expect(rowValues(table, '5XL')).toEqual(['1', '—', '3', '4'])
  expect(rowValues(table, '3XL')).toEqual(['—', '4', '0', '4'])
  expect(rowValues(table, '成人小计')).toEqual(['1', '4', '3', '8'])
  expect(rowValues(table, '12K')).toEqual(['2', '2'])
  expect(rowValues(table, '童装小计')).toEqual(['2', '2'])
  expect(rowValues(table, '整单合计')).toEqual(['10'])
  const quantityCell = within(within(table).getByRole('row', {name: /^5XL /})).getByText('3')
  const headers = quantityCell.getAttribute('headers')!.split(' ').map(id => document.getElementById(id)?.textContent)
  expect(headers).toEqual(['成人', '5XL', orange.heading, 'Pink'])
  expect(screen.getAllByText('胸前图案')).toHaveLength(3)
  expect(screen.getAllByText(/FRONT_CENTER（A3）/)).toHaveLength(3)
})

it('uses explicit legacy audience labels and keeps unclassified products separate, including pending counts', () => {
  const unlinked: GarmentGroup = {...adult, heading: '定制帽子', pricingKind: 'unlinked',
    rows: [{size: 'M', colour: '', quantity: null}]}
  const unidentified: GarmentGroup = {...unlinked, heading: '卫衣', pricingKind: undefined,
    rows: [{size: 'L', colour: '', quantity: 3}]}
  render(<GarmentTables layout={{...layout, groups: [{...adult, pricingKind: undefined}, {...child, pricingKind: undefined}, unlinked, unidentified]}}/>)
  const table = screen.getByRole('table')
  expect(rowValues(table, '成人小计').at(-1)).toBe('5')
  expect(rowValues(table, '童装小计').at(-1)).toBe('2')
  expect(rowValues(table, '其他小计')).toEqual(['待核', '3', '待核'])
  expect(rowValues(table, '整单合计')).toEqual(['待核'])
})

it('aligns design and shirt colour columns despite missing kids colours and a different saved group order', () => {
  const kidsWhite = {...child, rows: [{colour: 'Purple', size: '6K', quantity: 2}]}
  const kidsOrange = {...kidsWhite, heading: '童装 T恤 | Orange 图案',
    rows: [{colour: 'Yellow', size: '6K', quantity: 1}]}
  render(<GarmentTables layout={{...layout, groups: [adult, orange, kidsOrange, kidsWhite]}}/>)
  const table = screen.getByRole('table')
  expect(rowValues(table, '5XL')).toEqual(['1', '—', '3', '—', '4'])
  expect(rowValues(table, '6K')).toEqual(['—', '2', '—', '1', '3'])
  expect(rowValues(table, '童装小计')).toEqual(['—', '2', '—', '1', '3'])
  expect(rowValues(table, '整单合计')).toEqual(['1', '6', '3', '1', '11'])
  const cell = within(within(table).getByRole('row', {name: /^6K /})).getByText('1')
  expect(cell.getAttribute('headers')!.split(' ').map(id => document.getElementById(id)?.textContent))
    .toEqual(['童装', '6K', kidsOrange.heading, 'Yellow'])
})

it.each(['duplicate', 'wide', 'missing size'] as const)('keeps all original lines in one table for a %s grid', problem => {
  const first = adult.rows[0]
  const rows = problem === 'wide' ? Array.from({length: 7}, (_, i) => ({...first, colour: 'Colour ' + i})) :
    [{...first, size: problem === 'missing size' ? '' : first.size}, first]
  render(<GarmentTables layout={{...layout, groups: [{...adult, rows}, child]}}/>)
  const table = screen.getByRole('table')
  const lines = within(table).getAllByRole('rowheader', {name: adult.heading})
  expect(lines).toHaveLength(rows.length)
  lines.forEach((line, i) => expect(within(line.closest('tr')!).getAllByRole('cell').map(cell => cell.textContent))
    .toEqual([rows[i].colour, rows[i].size || '未注明', '1']))
  expect(rowValues(table, '整单合计')).toEqual([String(rows.length + 2)])
})

it('preserves separately named columns for groups with identical headings and colours', () => {
  render(<GarmentTables layout={{...layout, groups: [adult, {...orange, heading: adult.heading}, child]}}/>)
  const table = screen.getByRole('table')
  expect(within(table).getByText(adult.heading + '（第 1 组）')).toBeVisible()
  expect(within(table).getByText(adult.heading + '（第 2 组）')).toBeVisible()
  expect(rowValues(table, '5XL')).toEqual(['1', '—', '3', '4'])
})
