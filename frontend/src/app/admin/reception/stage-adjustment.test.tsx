import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { ReceptionDesk } from './ReceptionDesk'
import { advanceSheet, fetchQueue, fetchSheet, type SavedSheet, type Stage } from './sheets'

vi.mock('./InkPad', () => ({ InkPad: () => null }))
vi.mock('./sheets', async importOriginal => ({
  ...await importOriginal<typeof import('./sheets')>(),
  fetchQueue: vi.fn(), fetchSheet: vi.fn(), advanceSheet: vi.fn(),
}))

function sheets(stage: Stage, count: number): SavedSheet[] {
  return Array.from({ length: count }, (_, index) => ({
    id: stage + index, stage, customer: stage + ' ' + (index + 1), pickupDate: '2026-11-24',
    creationTime: '2026-11-20T12:00:00Z', phone: '', instructions: '', version: 'v1',
  }))
}

let records: SavedSheet[]
beforeEach(() => {
  vi.clearAllMocks()
  records = [...sheets('Preparing', 2), ...sheets('Collected', 1)]
  vi.mocked(fetchQueue).mockImplementation(async (stage, date, search, offset) => {
    const matches = records.filter(sheet => sheet.stage === stage && (!date || sheet.pickupDate === date)
      && sheet.customer.includes(search))
    return { items: matches.slice(offset, offset + 50), hasMore: matches.length > offset + 50 }
  })
  vi.mocked(fetchSheet).mockImplementation(async id => records.find(sheet => sheet.id === id)!)
})

it('opens the linked artwork independently from the customer and phone on the same ticket', async () => {
  records[0].phone = '021 555 0199'
  records[0].artwork = [{ id: 'logo', name: 'logo.png', mime: 'image/png' }]
  render(<ReceptionDesk />)
  const ticket = await screen.findByRole('button', { name: /Preparing 1 021 555 0199/ })
  const thumbnail = within(ticket.parentElement!).getByRole('button', { name: '预览 logo.png' })
  expect(within(thumbnail).getByRole('img')).toHaveAttribute('src', expect.stringMatching(/logo\/thumbnail$/))
  fireEvent.click(thumbnail)
  const preview = await screen.findByRole('dialog', { name: 'logo.png 预览' })
  expect(within(preview).getByAltText('logo.png 预览图')).toHaveAttribute('src', expect.stringMatching(/attachments\/logo$/))
  expect(fetchSheet).not.toHaveBeenCalled()
  fireEvent.click(within(preview).getByRole('button', { name: '关闭预览' }))
  fireEvent.click(ticket)
  await screen.findByDisplayValue('021 555 0199')
})

it('shows opening feedback only on the tapped ticket and ignores an earlier response after switching tickets', async () => {
  const [first, second] = records
  let finishFirst!: (sheet: SavedSheet) => void
  vi.mocked(fetchSheet).mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
  render(<ReceptionDesk />)
  const row = (n: number) => screen.getByRole('button', { name: new RegExp('^Preparing ' + n + ' ') })
  await screen.findByText(first.customer)
  fireEvent.click(row(1))
  expect(row(2)).toBeEnabled()
  expect(row(1)).toHaveAttribute('aria-busy', 'true')
  fireEvent.click(row(2))
  await screen.findByDisplayValue(second.customer)
  await act(async () => finishFirst(first))
  expect(screen.getByDisplayValue(second.customer)).toBeVisible()
})

it('can correct a collected ticket from its detail header without changing other tickets', async () => {
  vi.mocked(advanceSheet).mockImplementation(async (id, stage) => {
    const sheet = records.find(item => item.id === id)!
    sheet.stage = stage
    return {...sheet, version: 'v2'}
  })
  render(<ReceptionDesk initialSheet="Collected0" />)
  const select = await screen.findByRole('combobox', {name: '工单状态'})
  expect(select.closest('header')).not.toBeNull()
  expect(select).toHaveValue('Collected')
  fireEvent.change(select, {target: {value: 'Ready'}})
  expect(advanceSheet).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', {name: '确认更改状态'}))
  expect(await within(await screen.findByRole('region', {name: '已做完 · 未取走'})).findByText('Collected 1')).toBeVisible()
  expect(advanceSheet).toHaveBeenCalledWith('Collected0', 'Ready', 'v1')
})

it('keeps unsaved edits when a status change is pending', async () => {
  render(<ReceptionDesk initialSheet="Preparing0" />)
  const select = await screen.findByRole('combobox', {name: '工单状态'})
  fireEvent.change(select, {target: {value: 'Ready'}})
  fireEvent.change(screen.getByDisplayValue('Preparing 1'), {target: {value: 'Edited'}})
  expect(select).toBeDisabled()
  expect(screen.getByRole('button', {name: '确认更改状态'})).toBeDisabled()
  expect(screen.getByText('请先保存修改，再调整状态。')).toBeVisible()
  expect(advanceSheet).not.toHaveBeenCalled()
})
