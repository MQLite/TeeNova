import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ReceptionQueue } from './ReceptionQueue'
import { fetchQueue, type SavedSheet, type Stage } from './sheets'

vi.mock('./sheets', async original => ({
  ...await original<typeof import('./sheets')>(), fetchQueue: vi.fn(),
}))

function sheets(stage: Stage, count: number): SavedSheet[] {
  return Array.from({ length: count }, (_, index) => ({
    id: stage + index, stage, customer: stage + ' ' + (index + 1), pickupDate: '2026-11-24',
    creationTime: '2026-11-20T12:00:00Z', phone: '', instructions: '', version: 'v1',
  }))
}

it('shows recorded payments on the ticket row across all stages, independently of the deposit', async () => {
  const records: SavedSheet[] = [
    {...sheets('Preparing', 1)[0], totalPrice: 100, deposit: 30},
    {...sheets('Ready', 1)[0], totalPrice: 100, deposit: 30, payments: [{amount: 25, method: 'Cash'}]},
    {...sheets('Collected', 1)[0], totalPrice: 0.3, payments: [{amount: 0.1, method: 'EFTPOS'}, {amount: 0.2, method: 'Transfer'}]},
    {...sheets('Preparing', 2)[1], payments: [{amount: 12, method: 'Cash'}]},
  ]
  vi.mocked(fetchQueue).mockImplementation(async stage => ({items: records.filter(sheet => sheet.stage === stage), hasMore: false}))
  render(<ReceptionQueue active disabled={false} onOpen={vi.fn()} onNew={vi.fn()}/>)
  fireEvent.click(screen.getByText('已取走记录'))
  expect(await screen.findByRole('button', {name: /Preparing 1 .*收款未登记/})).toBeVisible()
  expect(await screen.findByRole('button', {name: /Ready 1 .*部分付款 NZ\$25.00/})).toBeVisible()
  expect(await screen.findByRole('button', {name: /Collected 1 .*已付清 NZ\$0\.30 · EFTPOS\/Transfer/})).toBeVisible()
  expect(await screen.findByRole('button', {name: /Preparing 2 .*已收 NZ\$12.00/})).toBeVisible()
})
