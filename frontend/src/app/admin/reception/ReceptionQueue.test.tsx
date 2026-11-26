import { fireEvent, render, screen, within } from '@testing-library/react'
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
  records = [...sheets('Preparing', 101), ...sheets('Ready', 51), ...sheets('Collected', 51)]
  vi.mocked(fetchQueue).mockImplementation(async (stage, date, search, offset) => {
    const matches = records.filter(sheet => sheet.stage === stage && (!date || sheet.pickupDate === date)
      && sheet.customer.includes(search))
    return { items: matches.slice(offset, offset + 50), hasMore: matches.length > offset + 50 }
  })
  vi.mocked(fetchSheet).mockImplementation(async id => records.find(sheet => sheet.id === id)!)
})

const queueTab = () => within(screen.getByRole('navigation')).getByRole('button', { name: '工单总览' })
async function nextPage(column: string) {
  fireEvent.click(await within(await screen.findByRole('region', { name: column })).findByRole('button', { name: '下一页' }))
}

it('returns to fresh, independent stage pages after opening a sheet or visiting the entry tab', async () => {
  render(<ReceptionDesk />)
  fireEvent.click(screen.getByText('已取走记录'))
  await nextPage('已取走工单')
  await screen.findByText('Collected 51')
  await nextPage('待完成工单')
  await screen.findByText('Preparing 51')
  await nextPage('待完成工单')
  fireEvent.click(await screen.findByText('Preparing 101'))
  await screen.findByRole('heading', { name: '编辑工作单' })
  records = records.map(sheet => sheet.customer === 'Preparing 101' ? { ...sheet, customer: 'Updated customer' } : sheet)
  fireEvent.click(queueTab())
  expect(await screen.findByText('Updated customer')).toBeVisible()
  expect(await screen.findByText('Ready 1')).toBeVisible()
  expect(await screen.findByText('Collected 51')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '接单录入' }))
  fireEvent.click(queueTab())
  expect(await screen.findByText('Updated customer')).toBeVisible()
  expect(await screen.findByText('Collected 51')).toBeVisible()
})

it('starts each filtered result on its first page and opens the archive for a search', async () => {
  render(<ReceptionDesk />)
  expect(screen.queryByRole('region', { name: '已取走工单' })).toBeNull()
  await nextPage('已做完 · 未取走')
  await screen.findByText('Ready 51')
  fireEvent.change(screen.getByLabelText('可取日期'), { target: { value: '2026-11-24' } })
  expect(await screen.findByText('Ready 1')).toBeVisible()
  await nextPage('已做完 · 未取走')
  await screen.findByText('Ready 51')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '1' } })
  expect(await screen.findByText('Ready 1')).toBeVisible()
  expect(await screen.findByText('Collected 1')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))
  await screen.findByText('Ready 2')
  expect(screen.queryByRole('region', { name: '已取走工单' })).toBeNull()
})

it('returns to the nearest remaining page after advancing the last sheet on a page', async () => {
  vi.mocked(advanceSheet).mockImplementation(async (id, stage) => {
    const sheet = records.find(item => item.id === id)!
    sheet.stage = stage
    return sheet
  })
  render(<ReceptionDesk />)
  await nextPage('待完成工单')
  await screen.findByText('Preparing 51')
  await nextPage('待完成工单')
  fireEvent.click(await screen.findByText('Preparing 101'))
  fireEvent.change(await screen.findByRole('combobox', { name: '工单状态' }), { target: { value: 'Ready' } })
  fireEvent.click(screen.getByRole('button', { name: '确认更改状态' }))
  expect(await screen.findByText('Preparing 51')).toBeVisible()
  expect(within(screen.getByRole('region', { name: '待完成工单' })).getByRole('button', { name: '下一页' })).toBeDisabled()
})
