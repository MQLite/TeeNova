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

it.each(['hoodie', 'kidsHoodie'] as const)('opens a %s worksheet with its combined total', pricingKind => {
  render(<GarmentEditor layout={{...layout, groups: [{...group, pricingKind}]}} onChange={vi.fn()}/>)
  expect(screen.getByRole('row', {name: /整单合计/})).toHaveTextContent('7')
})

it('keeps a blank garment row editable and displays the summary once a size is entered', () => {
  function Editor() {
    const [draft, setDraft] = useState<PrintLayout>({...layout, groups: [{...group, rows: [{colour: '', size: '', quantity: null}]}]})
    return <GarmentEditor layout={draft} onChange={setDraft}/>
  }
  render(<Editor/>)
  expect(screen.queryByRole('table', {name: '服装数量明细（件）'})).toBeNull()
  fireEvent.change(screen.getByLabelText('第1行尺码'), {target: {value: 'S'}})
  fireEvent.click(screen.getByRole('button', {name: '查看合并清单'}))
  expect(screen.getByRole('row', {name: /整单合计/})).toHaveTextContent('待核')
})

it('keeps group metadata and one editable blank row after removing the final size', () => {
  const changed = vi.fn()
  function Editor() {
    const [draft, setDraft] = useState(layout)
    return <GarmentEditor layout={draft} onChange={next => { setDraft(next); changed(next) }}/>
  }
  render(<Editor/>)
  fireEvent.click(screen.getByRole('button', {name: '编辑服装明细'}))
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
  fireEvent.click(screen.getByRole('button', {name: '编辑服装明细'}))
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
  fireEvent.click(screen.getByRole('button', {name: '编辑服装明细'}))
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

it('defaults to a single mixed order list and edits the original groups without losing notes or pricing', () => {
  const kids: GarmentGroup = {...sibling, pricingKind: 'kidsHoodie'}
  const changed = vi.fn()
  function Editor() {
    const [draft, setDraft] = useState({...layout, groups: [group, kids]})
    return <GarmentEditor layout={draft} onChange={next => { setDraft(next); changed(next) }}/>
  }
  render(<Editor/>)
  expect(screen.getAllByRole('table')).toHaveLength(1)
  expect(screen.getByText('整单合计').closest('tr')).toHaveTextContent('14')
  expect(changed).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', {name: '编辑服装明细'}))
  const section = within(screen.getByRole('region', {name: kids.heading}))
  fireEvent.change(section.getByLabelText('第1行数量'), {target: {value: '0'}})
  expect(changed).toHaveBeenLastCalledWith({...layout, groups: [group, {...kids,
    rows: [{...kids.rows[0], quantity: 0}, kids.rows[1]]}]})
  fireEvent.click(screen.getByRole('button', {name: '查看合并清单'}))
  expect(screen.getByText('整单合计').closest('tr')).toHaveTextContent('11')
})

it('continues editing when a change creates a mixed order and exposes missing required headings', () => {
  function Editor() {
    const [draft, setDraft] = useState({...layout, title: ''})
    return <GarmentEditor layout={draft} onChange={setDraft}/>
  }
  render(<Editor/>)
  const section = within(screen.getByRole('region', {name: sibling.heading}))
  fireEvent.change(section.getByLabelText('估价商品'), {target: {value: 'kidsHoodie'}})
  const title = screen.getByLabelText('工作单标题')
  expect(screen.getByRole('table', {name: '服装数量明细（件）'})).toBeVisible()
  expect(title).toHaveAttribute('aria-invalid', 'true')
  expect(screen.queryByText('查看合并清单')).toBeNull()
  fireEvent.change(title, {target: {value: '新工单'}})
  expect(section.getByLabelText('估价商品')).toHaveValue('kidsHoodie')
  fireEvent.click(screen.getByRole('button', {name: '查看合并清单'}))
  expect(screen.getByRole('heading', {name: '新工单'})).toBeVisible()
})
