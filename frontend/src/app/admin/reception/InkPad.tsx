'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'

type Point = { x: number; y: number }
export type Stroke = { points: Point[]; erase: boolean }

// ReceptionSheetsController.Save validates the complete history, including eraser strokes.
const maxStrokes = 10_000
const maxPoints = 150_000

function capacityNotice(strokes: number, points: number) {
  if (points >= maxPoints) return '手稿已达书写点数上限。可保存已有手稿，或撤销后继续书写。'
  if (strokes >= maxStrokes) return '手稿已达笔画上限。可保存已有手稿，或撤销后添加新笔画。'
  if (strokes >= maxStrokes * 0.9 || points >= maxPoints * 0.9) return '手稿接近书写容量上限。请留意剩余书写空间。'
  return ''
}

export function InkPad({ initialStrokes, onReady, onStrokeStart, onChange, disabled, toolbarHost }: {
  toolbarHost: HTMLElement | null
  initialStrokes: Stroke[]
  onReady: (canvas: HTMLCanvasElement, hasInk: boolean) => void
  onStrokeStart?: () => void
  onChange: (canvas: HTMLCanvasElement, hasInk: boolean, strokes: Stroke[]) => void
  disabled: boolean
}) {
  const paper = useRef<HTMLCanvasElement>(null)
  const inkColor = useRef('black')
  const drawingRef = useRef<{ strokes: Stroke[]; pointCount: number }>()
  const drawing = drawingRef.current ??= {
    strokes: initialStrokes.slice(),
    pointCount: initialStrokes.reduce((total, stroke) => total + stroke.points.length, 0),
  }
  const history = drawing.strokes
  const pointer = useRef<number>()
  const scrollDrag = useRef<{ id: number; y: number }>()
  const [eraser, setEraser] = useState(false)
  const [allowTouch, setAllowTouch] = useState(false)
  const [count, setCount] = useState(initialStrokes.length)
  const [hasInk, setHasInk] = useState(false)
  const [notice, setNotice] = useState(() => capacityNotice(history.length, drawing.pointCount))

  function position(e: PointerEvent<HTMLCanvasElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1800, Math.max(0, Math.round((e.clientX - box.left) * 1800 / box.width))),
      y: Math.min(900, Math.max(0, Math.round((e.clientY - box.top) * 900 / box.height))),
    }
  }
  const segment = useCallback((a: Point, b: Point, erase: boolean) => {
    const ctx = paper.current!.getContext('2d')!
    ctx.strokeStyle = erase ? 'white' : inkColor.current
    ctx.lineWidth = erase ? 40 : 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(a.x === b.x && a.y === b.y ? b.x + 0.1 : b.x, b.y)
    ctx.stroke()
  }, [])
  function start(e: PointerEvent<HTMLCanvasElement>) {
    if (disabled || e.button !== 0 || pointer.current !== undefined) return
    if (e.pointerType === 'touch' && !allowTouch) {
      if (!scrollDrag.current) {
        e.currentTarget.setPointerCapture(e.pointerId)
        scrollDrag.current = { id: e.pointerId, y: e.clientY }
      }
      return
    }
    scrollDrag.current = undefined
    if (history.length >= maxStrokes || drawing.pointCount >= maxPoints) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointer.current = e.pointerId
    const p = position(e)
    history.push({ points: [p], erase: eraser })
    drawing.pointCount++
    setNotice(capacityNotice(history.length, drawing.pointCount))
    segment(p, p, eraser)
    onStrokeStart?.()
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    const drag = scrollDrag.current
    if (drag && drag.id === e.pointerId) {
      window.scrollBy({ top: drag.y - e.clientY, behavior: 'instant' })
      drag.y = e.clientY
      return
    }
    if (pointer.current !== e.pointerId || drawing.pointCount >= maxPoints) return
    const line = history[history.length - 1]
    const p = position(e)
    const previous = line.points[line.points.length - 1]
    if (previous.x === p.x && previous.y === p.y) return
    segment(previous, p, line.erase)
    line.points.push(p)
    drawing.pointCount++
    const nextNotice = capacityNotice(history.length, drawing.pointCount)
    if (notice !== nextNotice) setNotice(nextNotice)
  }
  function containsInk() {
    const canvas = paper.current!
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    return new Uint32Array(pixels.buffer).some(pixel => pixel !== 0xffffffff)
  }
  function changed(ink: boolean) {
    setCount(history.length)
    setHasInk(ink)
    onChange(paper.current!, ink, history.slice())
  }
  function end(e: PointerEvent<HTMLCanvasElement>) {
    if (scrollDrag.current?.id === e.pointerId) scrollDrag.current = undefined
    if (pointer.current !== e.pointerId) return
    if (e.type === 'pointerup') move(e)
    pointer.current = undefined
    const stroke = history[history.length - 1]
    changed(!stroke.erase || containsInk())
  }
  const redraw = useCallback(() => {
    const ctx = paper.current!.getContext('2d')!
    inkColor.current = getComputedStyle(ctx.canvas).color
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, 1800, 900)
    for (const stroke of history) {
      stroke.points.forEach((p, index) => segment(stroke.points[Math.max(0, index - 1)], p, stroke.erase))
    }
  }, [history, segment])
  useEffect(() => {
    redraw()
    const ink = history.length > 0 && containsInk()
    setHasInk(ink)
    onReady(paper.current!, ink)
  }, [history, onReady, redraw])
  function undo() {
    if (pointer.current !== undefined) return
    const removed = history.pop()
    if (!removed) return
    drawing.pointCount -= removed.points.length
    setNotice(capacityNotice(history.length, drawing.pointCount))
    redraw()
    changed(history.length > 0 && containsInk())
  }
  return <>
    <div className="rc-paper"><div className="rc-paperhead">客户原稿 <span>自由手写</span></div>
      <canvas ref={paper} width={1800} height={900} aria-label="手写接单纸" aria-disabled={disabled} onPointerDown={start}
        onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} />
      {!hasInk && <span className="rc-prompt">用手写笔直接写，例如 White B&amp;F、M 8、L 10</span>}
    </div>
    {notice && <p role="status" className="rc-error">{notice}</p>}
    {toolbarHost && createPortal(<div className="rc-tools rc-ink-tools" role="group" aria-label="手写工具">
      <button disabled={disabled} aria-pressed={!eraser} onClick={() => setEraser(false)}>手写笔</button>
      <button disabled={disabled} aria-pressed={eraser} onClick={() => setEraser(true)}>橡皮</button>
      <button disabled={disabled || !count} onClick={undo}>撤销</button>
      <label className="rc-touch"><input type="checkbox" checked={allowTouch} disabled={disabled}
        onChange={e => setAllowTouch(e.target.checked)}/>允许手指书写</label></div>, toolbarHost)}
  </>
}
