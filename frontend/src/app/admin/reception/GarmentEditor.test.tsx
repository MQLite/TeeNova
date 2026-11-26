import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { GarmentGroup, PrintLayout } from '@/features/reception/worksheet'
import { GarmentEditor } from './GarmentEditor'

const group: GarmentGroup = {
  heading: '成人双面', notes: '按原稿制作', pricingKind: 'hoodie', presentation: 'rows',
  prints: [{area: 'FRONT_CENTER', size: 'A3'}],
  rows: [{colour: 'Black', size: 'M', quantity: 3}, {colour: 'Blue', size: 'L', quantity: 4}],
}
const sibling = {...group, heading: '童装'}
const layout: PrintLayout = {title: '门店工单', groups: [group, sibling]}

it('keeps group metadata and one editable blank row after removing the final size', () => {
  const changed = vi.fn()
  function Editor() {
    const [draft, setDraft] = useState(layout)
    return <GarmentEditor layout={draft} onChange={next => { setDraft(next); changed(next) }}/>
  }
  render(<Editor/>)
  const section = within(screen.getByRole('region', {name: group.heading}))
  fireEvent.click(section.getByRole('button', {name: '删除第1行'}))
  expect(section.getByLabelText('第1行尺码')).toHaveValue('L')
  fireEvent.click(section.getByRole('button', {name: '删除第1行'}))
  const blankRow = {colour: '', size: '', quantity: null}
  const expected = (size: string) => ({...layout, groups: [{...group, rows: [{...blankRow, size}]}, sibling]})
  expect(changed).toHaveBeenLastCalledWith(expected(''))
  fireEvent.change(section.getByLabelText('第1行尺码'), {target: {value: 'XL'}})
  expect(changed).toHaveBeenLastCalledWith(expected('XL'))
})

it('removes only the selected group after explicit confirmation', () => {
  const changed = vi.fn()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  render(<GarmentEditor layout={layout} onChange={changed}/>)
  const remove = within(screen.getByRole('region', {name: group.heading})).getByRole('button', {name: '删除整个分组'})
  fireEvent.click(remove)
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining(group.heading))
  expect(changed).not.toHaveBeenCalled()
  fireEvent.click(remove)
  expect(changed).toHaveBeenCalledWith({...layout, groups: [sibling]})
})

it('keeps recognized prints until the operator confirms a garment-only estimate', () => {
  const changed = vi.fn()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  const invalid = {...group, prints: [{area: 'UNAVAILABLE', size: ''}]}
  const {rerender} = render(<GarmentEditor layout={{...layout, groups: [invalid]}} onChange={changed}/>)
  expect(screen.queryByLabelText('印花位置')).toBeNull()
  expect(screen.queryByLabelText('印花大小')).toBeNull()
  const garmentOnly = screen.getByRole('button', {name: '选择仅计衣价（不含印花费）'})
  fireEvent.click(garmentOnly)
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('清除'))
  expect(changed).not.toHaveBeenCalled()
  fireEvent.click(garmentOnly)
  const next = {...layout, groups: [{...invalid, prints: []}]}
  expect(changed).toHaveBeenCalledWith(next)
  rerender(<GarmentEditor layout={next} onChange={changed}/>)
  expect(screen.getByText('仅计衣价（不含印花费）')).toBeVisible()
  expect(screen.queryByRole('button', {name: /仅计衣价/})).toBeNull()
})
