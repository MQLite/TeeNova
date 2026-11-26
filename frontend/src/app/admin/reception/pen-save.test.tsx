import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { blankWorksheet } from '@/features/reception/worksheet'
import { ReceptionDesk } from './ReceptionDesk'
import { saveSheet, type SavedSheet } from './sheets'

vi.mock('./sheets', async importOriginal => ({
  ...await importOriginal<typeof import('./sheets')>(),
  fetchQueue: async () => ({ items: [], hasMore: false }),
  saveSheet: vi.fn(),
}))
vi.mock('@/features/reception/useReceptionEstimate', () => ({
  useReceptionEstimate: () => ({ text: '', printText: '' }),
}))

const saved: SavedSheet = { ...blankWorksheet, id: 'saved', stage: 'Preparing', version: 'v1',
  creationTime: '2026-11-24T01:00:00Z' }

function startWorksheet() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return { canvas: this, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} } as unknown as CanvasRenderingContext2D
  })
  vi.mocked(saveSheet).mockReset().mockResolvedValue(saved)
  render(<ReceptionDesk />)
  fireEvent.click(screen.getByRole('button', { name: '新建接待工单' }))
  const canvas = screen.getByLabelText('手写接单纸') as HTMLCanvasElement
  canvas.setPointerCapture = vi.fn()
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1800, 900))
  return (type: string, x: number, pointerId = 1) => fireEvent(canvas,
    Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: 10 }), { pointerId, pointerType: 'pen' }))
}

it.each(['pointerup', 'pointercancel', 'lostpointercapture'])('saves the complete first stroke once after %s', async end => {
  const pointer = startWorksheet()
  pointer('pointerdown', 10)
  const save = screen.getByRole('button', { name: '保存工单' })
  expect(save).toBeEnabled()
  fireEvent.click(save)
  expect(save).toBeDisabled()
  expect(screen.getByRole('button', { name: '核对工作单' })).toBeDisabled()
  pointer('pointermove', 20)
  pointer(end, 20, 2)
  expect(saveSheet).not.toHaveBeenCalled()
  pointer('pointermove', 30)
  pointer(end, 40)
  pointer('lostpointercapture', 30)
  await waitFor(() => expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled())
  expect(saveSheet).toHaveBeenCalledTimes(1)
  expect(vi.mocked(saveSheet).mock.calls[0][2]).toEqual([
    { points: end === 'pointerup'
      ? [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 30, y: 10 }, { x: 40, y: 10 }]
      : [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 30, y: 10 }], erase: false },
  ])
})

it('includes earlier strokes and keeps edits after the submitted snapshot dirty', async () => {
  const pointer = startWorksheet()
  pointer('pointerdown', 10)
  pointer('pointerup', 10)
  pointer('pointerdown', 20)
  let acknowledge!: (value: SavedSheet) => void
  vi.mocked(saveSheet).mockReturnValueOnce(new Promise(resolve => { acknowledge = resolve }))
  fireEvent.click(screen.getByRole('button', { name: '保存工单' }))
  expect(saveSheet).not.toHaveBeenCalled()
  pointer('pointermove', 30)
  pointer('pointerup', 30)
  await waitFor(() => expect(saveSheet).toHaveBeenCalledTimes(1))
  const submitted = vi.mocked(saveSheet).mock.calls[0]
  // Model a field change already dispatched while the server response is pending.
  fireEvent.change(screen.getByRole('textbox', { name: '订金（NZD）' }), { target: { value: '12' } })
  await act(async () => acknowledge(saved))
  const saveAgain = screen.getByRole('button', { name: '保存修改' })
  expect(saveAgain).toBeEnabled()
  expect(submitted[1].deposit).toBeUndefined()
  expect(submitted[2]).toEqual([
    { points: [{ x: 10, y: 10 }], erase: false },
    { points: [{ x: 20, y: 10 }, { x: 30, y: 10 }], erase: false },
  ])
  fireEvent.click(saveAgain)
  await waitFor(() => expect(saveAgain).toBeDisabled())
  expect(saveSheet).toHaveBeenLastCalledWith(submitted[0], expect.objectContaining({ deposit: 12 }), submitted[2], 'v1', undefined, undefined)
})
