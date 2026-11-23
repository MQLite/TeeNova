'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { blankWorksheet, hasSheetContent, todayInAuckland, validSheetHeadings, type Worksheet } from '@/features/reception/worksheet'
import { recognizeCapture, type CaptureRequest } from '@/features/reception/recognize'
import { InkPad, type Stroke } from './InkPad'
import { GarmentEditor } from './GarmentEditor'
import { PrintSheet } from './PrintSheet'
import { ReceptionQueue } from './ReceptionQueue'
import { advanceSheet, fetchSheet, saveSheet, stages, type SavedSheet } from './sheets'
import { SheetAmounts } from './SheetAmounts'
import { ApiError } from '@/lib/api-client'
import { formatNzDate } from '@/lib/datetime'
import './reception.css'

export function ReceptionDesk() {
  const [view, setView] = useState<'write' | 'review' | 'queue'>('queue')
  const [sheet, setSheet] = useState<Worksheet>(blankWorksheet)
  const [received, setReceived] = useState(todayInAuckland)
  const [photo, setPhoto] = useState('')
  const [hasInk, setHasInk] = useState(false)
  const [record, setRecord] = useState<SavedSheet>()
  const [initialStrokes, setInitialStrokes] = useState<Stroke[]>([])
  const strokes = useRef<Stroke[]>([])
  const [conflict, setConflict] = useState(false)
  const [padKey, setPadKey] = useState(0)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const canvas = useRef<HTMLCanvasElement>()
  const sheetId = useRef<string>()
  const job = useRef<CaptureRequest>()
  const controller = useRef<AbortController>()
  const recognized = useRef(false)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (!dirty) return
    function preventLoss(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [dirty])

  const ready = useCallback((element: HTMLCanvasElement, ink: boolean) => {
    canvas.current = element
    setHasInk(ink)
    setPhoto(ink ? element.toDataURL('image/png') : '')
  }, [])

  function review() {
    if (canvas.current && hasInk) setPhoto(canvas.current.toDataURL('image/png'))
    else setPhoto('')
    setView('review')
  }
  async function recognize() {
    if (!canvas.current || busy) return
    if (hasSheetContent(sheet) && !window.confirm('识别结果将更新工作单；未识别到的金额保留当前值。是否继续？')) return
    setError('')
    setBusy('准备手稿…')
    controller.current?.abort()
    const token = new AbortController()
    controller.current = token
    try {
      if (!job.current) {
        const blob = await new Promise<Blob | null>(resolve => canvas.current!.toBlob(resolve, 'image/png'))
        if (!blob) throw new Error('无法读取手稿，请重试。')
        job.current = { key: crypto.randomUUID(), file: new File([blob], 'reception-note.png', { type: 'image/png' }) }
      }
      const result = await recognizeCapture(job.current, token.signal, text => { if (!token.signal.aborted) setBusy(text) })
      if (token.signal.aborted) return
      setSheet(current => ({...result, totalPrice: result.totalPrice ?? current.totalPrice,
        deposit: result.deposit ?? current.deposit}))
      recognized.current = true
      setDirty(true)
      review()
    } catch (e) { if (!token.signal.aborted) setError(e instanceof Error ? e.message : '识别失败，可以手动填写。') }
    finally {
      if (controller.current === token) controller.current = undefined
      if (!token.signal.aborted) setBusy('')
    }
  }
  function manual() {
    controller.current?.abort()
    setBusy('')
    setError('')
    review()
  }
  async function save() {
    if (busy || !dirty || !canSave) return
    setBusy('正在保存…')
    setError('')
    try {
      sheetId.current ??= crypto.randomUUID()
      const updated = await saveSheet(sheetId.current, sheet, strokes.current, record?.version)
      setRecord(updated)
      setDirty(false)
      setConflict(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，可以重试。')
      setConflict(e instanceof ApiError && e.status === 409)
    }
    finally { setBusy('') }
  }
  function newSheet() {
    if (dirty &&
        !window.confirm('开始下一张将清空当前未保存的手稿和摘要，是否继续？')) return
    setRecord(undefined); setSheet(blankWorksheet); setHasInk(false); setDirty(false)
    strokes.current = []; setInitialStrokes([]); setConflict(false)
    setPhoto(''); setError(''); setView('write'); setReceived(todayInAuckland())
    canvas.current = undefined; sheetId.current = undefined; job.current = undefined; recognized.current = false
    setPadKey(k => k + 1)
  }
  async function open(id: string) {
    if (dirty && !window.confirm('打开已保存版本会替换当前未保存的修改，是否继续？')) return
    setBusy('正在打开工单…')
    setError('')
    try {
      const next = await fetchSheet(id)
      setRecord(next)
      sheetId.current = next.id
      setSheet({customer: next.customer, phone: next.phone, pickupDate: next.pickupDate ?? '',
        instructions: next.instructions, totalPrice: next.totalPrice, deposit: next.deposit, layout: next.layout})
      strokes.current = next.handwriting ?? []
      setInitialStrokes(strokes.current)
      setPadKey(k => k + 1)
      setReceived(formatNzDate(next.creationTime, {year:'numeric',month:'short',day:'numeric'}))
      setDirty(false); setConflict(false); setView('review')
      recognized.current = false; job.current = undefined
    } catch (e) { setError(e instanceof Error ? e.message : '打开失败。') }
    finally { setBusy('') }
  }
  async function advance() {
    if (!record || busy || dirty || record.stage === 'Collected') return
    setBusy('正在更新状态…')
    setError('')
    try {
      setRecord(await advanceSheet(record.id, record.stage === 'Preparing' ? 'Ready' : 'Collected', record.version))
      setView('queue')
    } catch (e) {
      setError(e instanceof Error ? e.message : '状态更新失败。')
      setConflict(e instanceof ApiError && e.status === 409)
    }
    finally { setBusy('') }
  }
  const printable = hasSheetContent(sheet) && validSheetHeadings(sheet)
  const canSave = validSheetHeadings(sheet) && (hasSheetContent(sheet) || hasInk || !!record)
  function edit<K extends keyof Worksheet>(key: K, value: Worksheet[K]) {
    setSheet(current => ({...current, [key]: value}))
    setDirty(true)
  }
  return <div className="reception-desk" lang="zh-CN">
    <header className="rc-mast"><strong>TeeNova</strong><span>接待工作台</span></header>
    <nav aria-label="接待导航">{([['queue','工单总览'], ['write','手写接单'], ['review','核对工作单']] as const).map(([tab,label]) =>
      <button key={tab} disabled={!!busy} aria-current={view === tab ? 'page' : undefined} onClick={() => { setError(''); if (tab === 'review') review(); else setView(tab) }}>{label}</button>)}</nav>
    <div className="rc-body">
      {error && <p className="rc-error" role="alert">{error}
        {conflict && record && <button onClick={() => void open(record.id)}>重新载入工单</button>}</p>}
      {busy && <p role="status">{busy}</p>}
      <section hidden={view !== 'write'}>
        <div className="rc-heading"><div><small>{received}</small><h1>接待手记</h1></div><span>门店自取</span></div>
        <InkPad key={padKey} initialStrokes={initialStrokes} onReady={ready} disabled={!!busy} onChange={(element, ink, lines) => {
          canvas.current = element; setHasInk(ink); strokes.current = lines; setDirty(true)
          job.current = undefined; recognized.current = false
        }}/>
        <fieldset disabled={!!busy}><SheetAmounts sheet={sheet} onChange={edit}/></fieldset>
        <div className="rc-actions rc-end">
          <button disabled={!!busy || !dirty || !canSave} onClick={() => void save()}>{record ? '保存修改' : '保存工单'}</button>
          <button disabled={!!busy && !controller.current} onClick={manual}>{busy ? '转为手动填写' : '手动填写'}</button>
          <button className="rc-primary" disabled={!hasInk || !!busy} onClick={() => recognized.current ? review() : void recognize()}>整理成工作单</button></div>
      </section>
      {view === 'review' && <section><div className="rc-heading"><h1>{record ? '编辑工作单' : '核对工作单'}</h1>
        <span>{record && stages[record.stage] + ' · '}{dirty ? '待保存' : record ? '已保存' : '草稿'}</span></div>
        <div className="rc-review"><div>{photo ? <div className="rc-paper"><div className="rc-paperhead">手写原稿</div>
          {/* The preview is generated on this pad from the captured strokes. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="当前工作单的手写原稿" /></div> : <p>此工单还没有保存手稿。</p>}
          <button disabled={!!busy} onClick={() => setView('write')}>编辑手稿</button></div>
          <fieldset disabled={!!busy}><div className="rc-fields"><label>客户姓名<input value={sheet.customer} maxLength={160} onChange={e => edit('customer', e.target.value)}/></label>
          <label>联系电话<input type="tel" value={sheet.phone} maxLength={80} onChange={e => edit('phone', e.target.value)}/></label>
          <label>预计可取日期<input type="date" value={sheet.pickupDate} onChange={e => edit('pickupDate', e.target.value)}/></label></div>
          <SheetAmounts sheet={sheet} onChange={edit}/>
          <GarmentEditor layout={sheet.layout} onChange={layout => edit('layout', layout)}/>
          <label>制作说明<textarea rows={3} value={sheet.instructions} maxLength={24000} onChange={e => edit('instructions', e.target.value)} placeholder="交付约定或整单备注"/></label></fieldset>
        </div><div className="rc-actions rc-end">
          <button disabled={!!busy} onClick={newSheet}>开始下一张</button>
          <button disabled={!!busy || !dirty || !canSave} onClick={() => void save()}>{record ? '保存修改' : '保存到取货列表'}</button>
          {record && record.stage !== 'Collected' && <button disabled={dirty || !!busy} onClick={() => void advance()}>
            {record.stage === 'Preparing' ? '标为已做好' : '登记已取货'}</button>}
          <button className="rc-primary" disabled={!!busy || !printable} onClick={() => window.print()}>打印 / 保存 A4 PDF</button>
        </div><PrintSheet sheet={sheet} received={received} id={record?.id}/>
      </section>}
      <ReceptionQueue onOpen={id => void open(id)} onNew={newSheet} disabled={!!busy} active={view === 'queue'}/>
    </div>
  </div>
}
