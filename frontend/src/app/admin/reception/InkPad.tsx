'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'

type Point = { x: number; y: number }
export type Stroke = { points: Point[]; erase: boolean }

export function InkPad({ initialStrokes, onReady, onChange, disabled, toolbarHost }: {
  toolbarHost: HTMLElement | null
  initialStrokes: Stroke[]
  onReady: (canvas: HTMLCanvasElement, hasInk: boolean) => void
  onChange: (canvas: HTMLCanvasElement, hasInk: boolean, strokes: Stroke[]) => void
  disabled: boolean
}) {
  const paper = useRef<HTMLCanvasElement>(null)
  const inkColor = useRef('black')
  const history = useRef<Stroke[]>(initialStrokes.slice())
  const pointer = useRef<number>()
  const [eraser, setEraser] = useState(false)
  const [allowTouch, setAllowTouch] = useState(false)
  const [count, setCount] = useState(initialStrokes.length)

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
    if (disabled || (e.pointerType === 'touch' && !allowTouch) || e.button !== 0 || pointer.current !== undefined) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointer.current = e.pointerId
    const p = position(e)
    history.current.push({ points: [p], erase: eraser })
    segment(p, p, eraser)
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== e.pointerId) return
    const line = history.current[history.current.length - 1]
    const p = position(e)
    segment(line.points[line.points.length - 1], p, line.erase)
    line.points.push(p)
  }
  function containsInk() {
    const canvas = paper.current!
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    return new Uint32Array(pixels.buffer).some(pixel => pixel !== 0xffffffff)
  }
  function changed() {
    setCount(history.current.length)
    onChange(paper.current!, containsInk(), history.current.slice())
  }
  function end(e: PointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== e.pointerId) return
    pointer.current = undefined
    changed()
  }
  const redraw = useCallback(() => {
    const ctx = paper.current!.getContext('2d')!
    inkColor.current = getComputedStyle(ctx.canvas).color
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, 1800, 900)
    for (const stroke of history.current) {
      stroke.points.forEach((p, index) => segment(stroke.points[Math.max(0, index - 1)], p, stroke.erase))
    }
  }, [segment])
  useEffect(() => {
    redraw()
    onReady(paper.current!, history.current.length > 0 && containsInk())
  }, [onReady, redraw])
  function undo() {
    history.current.pop()
    redraw()
    changed()
  }
  return <>
    <div className="rc-paper"><div className="rc-paperhead">客户原稿 <span>自由手写</span></div>
      <canvas ref={paper} width={1800} height={900} aria-label="手写接单纸" onPointerDown={start}
        onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} />
      {!count && <span className="rc-prompt">用手写笔直接写，例如 White B&amp;F、M 8、L 10</span>}
    </div>
    {toolbarHost && createPortal(<div className="rc-tools rc-ink-tools" role="group" aria-label="手写工具">
      <button disabled={disabled} aria-pressed={!eraser} onClick={() => setEraser(false)}>手写笔</button>
      <button disabled={disabled} aria-pressed={eraser} onClick={() => setEraser(true)}>橡皮</button>
      <button disabled={disabled || !count} onClick={undo}>撤销</button>
      <label className="rc-touch"><input type="checkbox" checked={allowTouch} disabled={disabled}
        onChange={e => setAllowTouch(e.target.checked)}/>允许手指书写</label></div>, toolbarHost)}
  </>
}
