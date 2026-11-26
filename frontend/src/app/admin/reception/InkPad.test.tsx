import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { InkPad, type Stroke } from './InkPad'

const dot: Stroke = { points: [{ x: 20, y: 20 }], erase: false }
const prompt = /用手写笔直接写/

function setup(initialStrokes: Stroke[] = []) {
  // jsdom has no canvas renderer. Supply the pixel returned after an erase.
  const readPixels = vi.fn(() => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }))
  let drawnSegments = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return { canvas: this, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { drawnSegments++ },
      getImageData: readPixels } as unknown as CanvasRenderingContext2D
  })
  const change = vi.fn()
  render(<InkPad toolbarHost={document.body} initialStrokes={initialStrokes}
    onReady={vi.fn()} onChange={change} disabled={false} />)
  const canvas = screen.getByLabelText('手写接单纸') as HTMLCanvasElement
  canvas.setPointerCapture = vi.fn()
  vi.spyOn(canvas, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, canvas.width, canvas.height))
  function pointer(type: string, x = 20, y = 20, pointerType = 'pen', pointerId = 1) {
    fireEvent(canvas, Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }),
      { pointerId, pointerType }))
  }
  function tap() {
    pointer('pointerdown')
    pointer('pointerup')
  }
  return { tap, pointer, canvas, change, readPixels, drawn: () => drawnSegments }
}

it('reports a pen dot without reading back the whole canvas', () => {
  const { tap, canvas, change, readPixels } = setup()
  tap()
  expect(readPixels).not.toHaveBeenCalled()
  expect(change).toHaveBeenLastCalledWith(canvas, true, [dot])
  expect(screen.queryByText(prompt)).toBeNull()
})

it('keeps the existing coordinates when extending and records strokes on the added paper', () => {
  const { canvas, tap, pointer, change } = setup()
  tap()
  fireEvent.click(screen.getByRole('button', { name: '向下加长手写纸' }))
  expect(canvas.height).toBe(1800)
  vi.mocked(canvas.getBoundingClientRect).mockReturnValue(new DOMRect(20, -180, 900, 900))
  pointer('pointerdown', 70, 400)
  pointer('pointerup', 80, 420)
  expect(change.mock.lastCall?.[2]).toEqual([dot, { points: [{ x: 100, y: 1160 }, { x: 120, y: 1200 }], erase: false }])
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(change.mock.lastCall?.[2]).toEqual([dot])
})

it('restores the used paper height from saved strokes and limits further extension', () => {
  const { canvas, drawn } = setup([dot, { points: [{ x: 50, y: 2300 }], erase: false }])
  expect(canvas.height).toBe(2700)
  expect(drawn()).toBe(2)
  fireEvent.click(screen.getByRole('button', { name: '向下加长手写纸' }))
  expect(canvas.height).toBe(3600)
  expect(screen.getByRole('button', { name: '已达最大纸长' })).toBeDisabled()
})

it('distinguishes partial and complete erasure and keeps the eraser undoable', () => {
  const { tap, change, readPixels } = setup()
  tap()
  fireEvent.click(screen.getByRole('button', { name: '橡皮' }))
  readPixels.mockReturnValueOnce({ data: new Uint8ClampedArray([0, 0, 0, 255]) })
  tap()
  expect(change.mock.lastCall?.[1]).toBe(true)
  tap()
  expect(change.mock.lastCall?.[1]).toBe(false)
  expect(screen.getByText(prompt)).toBeVisible()
  readPixels.mockReturnValueOnce({ data: new Uint8ClampedArray([0, 0, 0, 255]) })
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(change.mock.lastCall?.[1]).toBe(true)
  expect(screen.queryByText(prompt)).toBeNull()
})

it('shows the empty prompt when a saved stroke history replays to blank paper', () => {
  setup([dot, { ...dot, erase: true }])
  expect(screen.getByText(prompt)).toBeVisible()
  expect(screen.getByRole('button', { name: '撤销' })).toBeEnabled()
})

it('deduplicates adjacent rounded points while preserving a return to an earlier point', () => {
  const { pointer, change, drawn } = setup()
  pointer('pointerdown')
  pointer('pointermove', 20.4)
  pointer('pointermove', 21)
  pointer('pointermove', 21)
  pointer('pointermove', 20)
  pointer('pointerup')
  expect(change.mock.lastCall?.[2][0].points).toEqual([{ x: 20, y: 20 }, { x: 21, y: 20 }, { x: 20, y: 20 }])
  expect(drawn()).toBe(3)
})

it('warns near the stroke limit, accepts the last full stroke and frees capacity on undo', () => {
  const { pointer, tap, change, drawn } = setup(Array<Stroke>(9_999).fill(dot))
  expect(screen.getByRole('status')).toHaveTextContent('接近')
  pointer('pointerdown')
  pointer('pointermove', 21)
  pointer('pointerup', 21)
  expect(screen.getByRole('status')).toHaveTextContent('已达')
  expect(change.mock.lastCall?.[2]).toHaveLength(10_000)
  expect(change.mock.lastCall?.[2][9_999].points).toHaveLength(2)
  const before = drawn()
  tap()
  expect(drawn()).toBe(before)
  expect(change).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.getByRole('status')).toHaveTextContent('接近')
  tap()
  expect(change.mock.lastCall?.[2]).toHaveLength(10_000)
})

it('stops a pen stroke at the aggregate point limit and preserves existing strokes', () => {
  const points = Array.from({ length: 149_997 }, (_, i) => ({ x: i % 2, y: 0 }))
  const existing = [{ points, erase: false }, dot]
  const { pointer, tap, change, drawn } = setup(existing)
  expect(screen.getByRole('status')).toHaveTextContent('接近')
  pointer('pointerdown')
  pointer('pointermove', 21)
  expect(screen.getByRole('status')).toHaveTextContent('已达')
  const before = drawn()
  pointer('pointermove', 22)
  pointer('pointerup')
  tap()
  expect(drawn()).toBe(before)
  const saved = change.mock.lastCall?.[2] as Stroke[]
  expect(saved).toHaveLength(3)
  expect(saved[0]).toBe(existing[0])
  expect(saved[2].points).toEqual([{ x: 20, y: 20 }, { x: 21, y: 20 }])
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.getByRole('status')).toHaveTextContent('接近')
  tap()
  expect(change.mock.lastCall?.[2][2]).toEqual(dot)
})

it('scrolls on a finger drag, suspends the drag for a pen, and ignores its palm contacts', () => {
  const { pointer, change } = setup()
  const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  pointer('pointerdown', 20, 100, 'touch', 2)
  pointer('pointermove', 20, 60, 'touch', 2)
  expect(scroll).toHaveBeenCalledWith({ top: 40, behavior: 'instant' })
  pointer('pointerdown')
  pointer('pointermove', 20, 40, 'touch', 2)
  pointer('pointerdown', 20, 40, 'touch', 3)
  pointer('pointermove', 20, 30, 'touch', 3)
  pointer('pointermove', 20, 120)
  pointer('pointerup', 20, 120)
  pointer('pointermove', 20, 20, 'touch', 2)
  pointer('pointerup', 20, 20, 'touch', 2)
  expect(scroll).toHaveBeenCalledTimes(1)
  expect(change.mock.lastCall?.[2]).toEqual([{ points: [{ x: 20, y: 20 }, { x: 20, y: 120 }], erase: false }])
})

it('draws with a finger when enabled and ignores other contacts during the stroke', () => {
  const { pointer, change } = setup()
  const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  fireEvent.click(screen.getByLabelText('允许手指书写'))
  pointer('pointerdown', 20, 20, 'touch', 2)
  pointer('pointerdown', 25, 25, 'touch', 3)
  pointer('pointermove', 30, 30, 'touch', 3)
  pointer('pointermove', 20, 100, 'touch', 2)
  pointer('pointerup', 20, 100, 'touch', 2)
  expect(change.mock.lastCall?.[2]).toEqual([{ points: [{ x: 20, y: 20 }, { x: 20, y: 100 }], erase: false }])
  expect(scroll).not.toHaveBeenCalled()
})
