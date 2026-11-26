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

it('shows the deposit and total on each ticket across all stages, independently of payment entries', async () => {
  const records: SavedSheet[] = [
    {...sheets('Preparing', 1)[0], totalPrice: 100, deposit: 30, payments: [{amount: 0, method: 'Cash'}]},
    {...sheets('Ready', 1)[0], totalPrice: 100, deposit: 0},
    {...sheets('Collected', 1)[0], totalPrice: 45.5, deposit: 45.5},
    {...sheets('Preparing', 2)[1], totalPrice: 80, deposit: null, payments: [{amount: 12, method: 'Cash'}]},
    {...sheets('Ready', 2)[1], deposit: 10},
  ]
  vi.mocked(fetchQueue).mockImplementation(async stage => ({items: records.filter(sheet => sheet.stage === stage), hasMore: false}))
  render(<ReceptionQueue active disabled={false} onOpen={vi.fn()} onNew={vi.fn()}/>)
  fireEvent.click(screen.getByText('已取走记录'))
  expect(await screen.findByRole('button', {name: /Preparing 1 .*已付款 NZ\$30\.00 \/ NZ\$100\.00/})).toBeVisible()
  expect(await screen.findByRole('button', {name: /Ready 1 .*已付款 NZ\$0\.00 \/ NZ\$100\.00/})).toBeVisible()
  expect(await screen.findByRole('button', {name: /Collected 1 .*已付款 NZ\$45\.50 \/ NZ\$45\.50/})).toBeVisible()
  expect(await screen.findByRole('button', {name: /Preparing 2 .*已付款 未填写 \/ NZ\$80\.00/})).toBeVisible()
  expect(await screen.findByRole('button', {name: /Ready 2 .*已付款 NZ\$10\.00 \/ 未填写/})).toBeVisible()
})
