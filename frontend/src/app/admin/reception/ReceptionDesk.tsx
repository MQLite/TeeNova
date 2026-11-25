'use client'
import { PendingNotice } from './PendingNotice'
import { DeleteSheetButton } from './DeleteSheetButton'
import { GmailArtwork } from './GmailArtwork'

import { useCallback, useEffect, useRef, useState } from 'react'
import { blankWorksheet, hasSheetContent, todayInAuckland, validSheetHeadings, type Worksheet } from '@/features/reception/worksheet'
import { ensureCaptureSource, recognizeCapture, type CaptureRequest } from '@/features/reception/recognize'
import { prepareReceptionPhoto } from '@/features/reception/photo'
import { mergeRecognition, type RecognitionDifference } from '@/features/reception/mergeRecognition'
import { sourceContentUrl } from '@/api/ai-order-imports'
import { useReceptionEstimate } from '@/features/reception/useReceptionEstimate'
import { InkPad, type Stroke } from './InkPad'
import { GarmentEditor } from './GarmentEditor'
import { PrintSheet } from './PrintSheet'
import { ReceptionQueue } from './ReceptionQueue'
import { RecognitionReview } from './RecognitionReview'
import { OriginalText, TextEditor, useTextOriginal } from './TextOriginal'
import { advanceSheet, fetchSheet, saveSheet, stages, type SavedSheet } from './sheets'
import { SheetAmounts } from './SheetAmounts'
import { ApiError } from '@/lib/api-client'
import { formatNzDate } from '@/lib/datetime'
import './reception.css'

export function ReceptionDesk({ initialSheet }: { initialSheet?: string } = {}) {
  const openedFromLink = useRef<string>()
  const openAttempt = useRef(0)
  const [deletedMessage, setDeletedMessage] = useState('')
  const [view, setView] = useState<'write' | 'review' | 'queue'>('queue')
  const [sheet, setSheet] = useState<Worksheet>(blankWorksheet)
  const [received, setReceived] = useState(todayInAuckland)
  const [photo, setPhoto] = useState('')
  const [sourcePhotoUrl, setSourcePhotoUrl] = useState('')
  const [textMode, setTextMode] = useState(false)
  const textOriginal = useTextOriginal()
  const { openSource: openTextSource } = textOriginal
  const [captureTools, setCaptureTools] = useState<HTMLDivElement | null>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  useEffect(() => () => {
    if (sourcePhotoUrl.startsWith('blob:')) URL.revokeObjectURL(sourcePhotoUrl)
  }, [sourcePhotoUrl])
  const [hasInk, setHasInk] = useState(false)
  const [record, setRecord] = useState<SavedSheet>()
  const [initialStrokes, setInitialStrokes] = useState<Stroke[]>([])
  const strokes = useRef<Stroke[]>([])
  const [conflict, setConflict] = useState(false)
  const [padKey, setPadKey] = useState(0)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [pendingRecognition, setPendingRecognition] = useState<{
    incoming: Worksheet; differences: RecognitionDifference[]; reviewMissing: boolean; textKey?: string
  }>()
  const lastAppliedTextKey = useRef<string>()
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
  async function selectPhoto(input: HTMLInputElement, method: 'Camera' | 'Upload') {
    const original = input.files?.[0]
    input.value = ''
    if (!original || busy) return
    if ((hasInk || sourcePhotoUrl) && !window.confirm('用这张照片替换当前原稿？')) return
    setError('')
    setBusy('正在读取照片…')
    try {
      const file = await prepareReceptionPhoto(original)
      const preview = URL.createObjectURL(file)
      job.current = { key: crypto.randomUUID(), file, method }
      recognized.current = false
      strokes.current = []
      setInitialStrokes([]); setHasInk(false); setPhoto('')
      setPadKey(k => k + 1)
      setSourcePhotoUrl(preview)
      setTextMode(false)
      setDirty(true)
    } catch (e) { setError(e instanceof Error ? e.message : '照片读取失败。') }
    finally { setBusy('') }
  }
  function useHandwriting() {
    if (!window.confirm('移除当前照片，改用手写接单？')) return
    setSourcePhotoUrl(''); setError(''); setDirty(true)
    job.current = undefined; recognized.current = false
  }
  function changeCaptureMode(useText: boolean) {
    setTextMode(useText)
    recognized.current = false
    setError('')
  }
  function editText(value: string) {
    // A pending recognition may finish after the operator has corrected the source.
    if (controller.current) {
      controller.current.abort()
      controller.current = undefined
      setBusy('')
    }
    textOriginal.edit(value)
    recognized.current = false
    setError('')
    setDirty(true)
  }
  const canRecognize = textMode ? textOriginal.valid : !!sourcePhotoUrl || hasInk
  async function recognize() {
    if (!canRecognize || busy) return
    if (hasSheetContent(sheet) && !window.confirm(textMode ? '现在识别原稿？空白字段将自动补齐，有差异的内容可逐项核对。' : '识别结果将更新工作单；未识别到的金额保留当前值。是否继续？')) return
    setError('')
    setBusy(textMode ? '准备文字原稿…' : '准备手稿…')
    controller.current?.abort()
    const token = new AbortController()
    controller.current = token
    try {
      let capture = textMode ? textOriginal.capture() : job.current
      if (!capture) {
        const blob = await new Promise<Blob | null>(resolve => canvas.current!.toBlob(resolve, 'image/png'))
        token.signal.throwIfAborted()
        if (!blob) throw new Error('无法读取手稿，请重试。')
        capture = job.current = { key: crypto.randomUUID(), file: new File([blob], 'reception-note.png', { type: 'image/png' }) }
      }
      const result = await recognizeCapture(capture, token.signal, text => { if (!token.signal.aborted) setBusy(text) })
      if (token.signal.aborted) return
      if (!textMode) {
        applyRecognition({ ...result, totalPrice: result.totalPrice ?? sheet.totalPrice, deposit: result.deposit ?? sheet.deposit })
        review()
        return
      }
      const textKey = capture.key
      // A revised transcript can withdraw a value. Let the operator decide before clearing it.
      const reviewMissing = textOriginal.edited && lastAppliedTextKey.current !== textKey &&
        Boolean(lastAppliedTextKey.current || record?.sourceText)
      const merged = mergeRecognition(sheet, result, undefined, reviewMissing)
      if (merged.differences.length) {
        setPendingRecognition({ incoming: result, differences: merged.differences, reviewMissing, textKey })
      } else {
        applyRecognition(merged.sheet, textKey)
      }
      review()
    } catch (e) { if (!token.signal.aborted) setError(e instanceof Error ? e.message : '识别失败，可以手动填写。') }
    finally {
      if (controller.current === token) controller.current = undefined
      if (!token.signal.aborted) setBusy('')
    }
  }
  function applyRecognition(next: Worksheet, textKey?: string) {
    if (textKey) lastAppliedTextKey.current = textKey
    setSheet(next)
    setPendingRecognition(undefined)
    recognized.current = true
    setDirty(true)
  }
  function manual() {
    controller.current?.abort()
    controller.current = undefined
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
      const source = sourcePhotoUrl && job.current ? await ensureCaptureSource(job.current) : undefined
      const sourceText = textOriginal.edited && textOriginal.valid
        ? await ensureCaptureSource(textOriginal.capture()) : textOriginal.source ?? undefined
      const updated = await saveSheet(sheetId.current, sheet, strokes.current, record?.version, source, sourceText)
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
    setDeletedMessage('')
    resetSheet()
  }
  function resetSheet() {
    openAttempt.current++
    controller.current?.abort()
    controller.current = undefined
    setPendingRecognition(undefined)
    lastAppliedTextKey.current = undefined
    setRecord(undefined); setSheet(blankWorksheet); setHasInk(false); setDirty(false)
    setSourcePhotoUrl('')
    setTextMode(false); openTextSource()
    strokes.current = []; setInitialStrokes([]); setConflict(false)
    setPhoto(''); setError(''); setView('write'); setReceived(todayInAuckland())
    canvas.current = undefined; sheetId.current = undefined; job.current = undefined; recognized.current = false
    setPadKey(k => k + 1)
  }
  const open = useCallback(async (id: string) => {
    setDeletedMessage('')
    if (dirty && !window.confirm('打开已保存版本会替换当前未保存的修改，是否继续？')) return
    const attempt = ++openAttempt.current
    controller.current?.abort()
    controller.current = undefined
    setBusy('正在打开工单…')
    setError('')
    try {
      const next = await fetchSheet(id)
      if (openAttempt.current !== attempt) return
      setPendingRecognition(undefined)
      lastAppliedTextKey.current = undefined
      setRecord(next)
      sheetId.current = next.id
      setSheet({customer: next.customer, phone: next.phone, pickupDate: next.pickupDate ?? '',
        instructions: next.instructions, totalPrice: next.totalPrice, deposit: next.deposit, layout: next.layout})
      strokes.current = next.handwriting ?? []
      setHasInk(strokes.current.length > 0)
      setInitialStrokes(strokes.current)
      setPadKey(k => k + 1)
      setReceived(formatNzDate(next.creationTime, {year:'numeric',month:'short',day:'numeric'}))
      setDirty(false); setConflict(false); setView('review')
      recognized.current = false; job.current = undefined
      setPhoto('')
      setSourcePhotoUrl(next.sourcePhoto ? sourceContentUrl(next.sourcePhoto.importId, next.sourcePhoto.documentId) : '')
      openTextSource(next.sourceText)
      setTextMode(!!next.sourceText)
      if (next.sourcePhoto) job.current = { key: crypto.randomUUID(), source: next.sourcePhoto }
    } catch (e) {
      if (openAttempt.current === attempt) setError(e instanceof Error ? e.message : '打开失败。')
    }
    finally { if (openAttempt.current === attempt) setBusy('') }
  }, [dirty, openTextSource])
  useEffect(() => {
    if (!initialSheet || openedFromLink.current === initialSheet) return
    openedFromLink.current = initialSheet
    void open(initialSheet)
  }, [initialSheet, open])
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
  const estimate = useReceptionEstimate(sheet.layout, sheet.instructions)
  const invalidTextEdit = textOriginal.edited && !textOriginal.valid &&
    (!!textOriginal.text || !!textOriginal.source || !!record?.sourceText)
  const canSave = !invalidTextEdit && validSheetHeadings(sheet) && (hasSheetContent(sheet) || hasInk || !!sourcePhotoUrl || !!record || textOriginal.valid)
  function edit<K extends keyof Worksheet>(key: K, value: Worksheet[K]) {
    setSheet(current => ({...current, [key]: value}))
    setDirty(true)
  }
  return <div className="reception-desk" lang="zh-CN">
    <header className="rc-mast"><strong>OtahuhuPrintingShop</strong><span>接待工作台</span></header>
    <nav aria-label="接待导航">{([['queue','工单总览'], ['write','接单录入'], ['review','核对工作单']] as const).map(([tab,label]) =>
      <button key={tab} disabled={!!busy || !!pendingRecognition} aria-current={view === tab ? 'page' : undefined} onClick={() => { setError(''); if (tab === 'review') review(); else setView(tab) }}>{label}</button>)}
      <a href="/admin/reception/pending">待关联设计稿</a></nav>
    <div className="rc-body">
      {error && <p className="rc-error" role="alert">{error}
        {conflict && record && <button onClick={() => void open(record.id)}>重新载入工单</button>}</p>}
      {busy && <p role="status">{busy}</p>}
      <section hidden={view !== 'write'}>
        <div className="rc-heading"><div><small>{received}</small><h1>接待手记</h1></div><span>门店自取</span></div>
        <div className="rc-tools" ref={setCaptureTools}>
          <input ref={cameraInput} hidden type="file" aria-label="拍摄接待原稿" accept="image/*" capture="environment" onChange={e => void selectPhoto(e.currentTarget, 'Camera')} />
          <input ref={galleryInput} hidden type="file" aria-label="选择接待原稿照片" accept="image/jpeg,image/png,image/webp" onChange={e => void selectPhoto(e.currentTarget, 'Upload')} />
          <button disabled={!!busy} onClick={() => cameraInput.current?.click()}>{sourcePhotoUrl ? '重新拍照' : '拍照'}</button>
          <button disabled={!!busy} onClick={() => galleryInput.current?.click()}>从相册选择</button>
          <button aria-pressed={textMode} disabled={!!busy} onClick={() => changeCaptureMode(true)}>粘贴文字</button>
          {textMode ? <button disabled={!!busy} onClick={() => changeCaptureMode(false)}>{sourcePhotoUrl ? '返回照片' : '返回手写'}</button>
            : sourcePhotoUrl && <button disabled={!!busy} onClick={useHandwriting}>改用手写</button>}
        </div>
        {textMode && view === 'write' && <TextEditor value={textOriginal} onChange={editText} disabled={!!busy && !controller.current}/>}
        {textMode && invalidTextEdit && !textOriginal.text.trim() && <p className="rc-error">请填写文字原稿后保存。</p>}
        {textMode && textOriginal.edited && dirty && record?.sourceText && <button disabled={!!busy}
          onClick={() => { recognized.current = false; openTextSource(record.sourceText) }}>恢复已保存的原文</button>}
        <div hidden={textMode}>{sourcePhotoUrl ? <OriginalPhoto url={sourcePhotoUrl} /> : <InkPad key={padKey} toolbarHost={view === 'write' && !textMode ? captureTools : null} initialStrokes={initialStrokes} onReady={ready} disabled={!!busy} onChange={(element, ink, lines) => {
          canvas.current = element; setHasInk(ink); strokes.current = lines; setDirty(true)
          job.current = undefined; recognized.current = false
        }}/>}</div>
        <fieldset disabled={!!busy}><SheetAmounts sheet={sheet} onChange={edit} estimate={estimate}/></fieldset>
        <div className="rc-actions rc-end">
          <button disabled={!!busy || !dirty || !canSave} onClick={() => void save()}>{record ? '保存修改' : '保存工单'}</button>
          <button disabled={!!busy && !controller.current} onClick={manual}>{busy ? '转为手动填写' : '手动填写'}</button>
          <button className="rc-primary" disabled={!canRecognize || !!busy} onClick={() => recognized.current ? review() : void recognize()}>整理成工作单</button></div>
      </section>
      {pendingRecognition && <RecognitionReview differences={pendingRecognition.differences} original={<OriginalText value={textOriginal}/>}
        onApply={accepted => applyRecognition(
          mergeRecognition(sheet, pendingRecognition.incoming, accepted, pendingRecognition.reviewMissing).sheet,
          pendingRecognition.textKey)}
        onCancel={() => setPendingRecognition(undefined)}/>}
      {view === 'review' && !pendingRecognition && <section><div className="rc-heading"><h1>{record ? '编辑工作单' : '核对工作单'}</h1>
        <span>{record && stages[record.stage] + ' · '}{dirty ? '待保存' : record ? '已保存' : '草稿'}</span></div>
        <div className="rc-review"><div>
          {textOriginal.hasOriginal && <OriginalText value={textOriginal}/>}
          {record && <GmailArtwork key={record.id} sheetId={record.id} />}
          {sourcePhotoUrl ? <OriginalPhoto url={sourcePhotoUrl} /> : photo ? <div className="rc-paper"><div className="rc-paperhead">手写原稿</div>
          {/* The preview is generated on this pad from the captured strokes. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="当前工作单的手写原稿" /></div> : !textOriginal.hasOriginal && <p>此工单还没有保存手稿。</p>}
          <button disabled={!!busy} onClick={() => setView('write')}>{textMode ? '编辑原文' : sourcePhotoUrl ? '更换原稿' : '编辑手稿'}</button></div>
          <fieldset disabled={!!busy}><div className="rc-fields"><label>客户姓名<input value={sheet.customer} maxLength={160} onChange={e => edit('customer', e.target.value)}/></label>
          <label>联系电话<input type="tel" value={sheet.phone} maxLength={80} onChange={e => edit('phone', e.target.value)}/></label>
          <label>预计可取日期<input type="date" value={sheet.pickupDate} onChange={e => edit('pickupDate', e.target.value)}/></label></div>
          <SheetAmounts sheet={sheet} onChange={edit} estimate={estimate}/>
          <GarmentEditor layout={sheet.layout} catalogue={estimate.catalogue} onChange={layout => edit('layout', layout)}/>
          <label>制作说明<textarea rows={3} value={sheet.instructions} maxLength={24000} onChange={e => edit('instructions', e.target.value)} placeholder="交付约定或整单备注"/></label></fieldset>
        </div>
        {invalidTextEdit && <p className="rc-error">请到「接单录入」修改文字原稿后保存。</p>}
        <div className="rc-actions rc-end">
          {record && <DeleteSheetButton sheet={record} disabled={!!busy} dirty={dirty}
            onDeleted={() => {
              if (initialSheet === record.id) window.history.replaceState(window.history.state, '', '/admin/reception')
              setDeletedMessage('已删除工单 #' + record.id.slice(0, 8))
              resetSheet(); setView('queue')
            }} />}
          <button disabled={!!busy} onClick={newSheet}>开始下一张</button>
          <button disabled={!!busy || !dirty || !canSave} onClick={() => void save()}>{record ? '保存修改' : '保存到取货列表'}</button>
          {record && record.stage !== 'Collected' && <button disabled={dirty || !!busy} onClick={() => void advance()}>
            {record.stage === 'Preparing' ? '标为已做好' : '登记已取货'}</button>}
          <button className="rc-primary" disabled={!!busy || !printable} onClick={() => window.print()}>打印 / 保存 A4 PDF</button>
        </div><PrintSheet sheet={sheet} received={received} id={record?.id} estimate={estimate.printText}/>
      </section>}
      {view === 'queue' && deletedMessage && <p role="status">{deletedMessage}</p>}
      {view === 'queue' && <PendingNotice />}
      <ReceptionQueue onOpen={id => void open(id)} onNew={newSheet} disabled={!!busy} active={view === 'queue'}/>
    </div>
  </div>
}

function OriginalPhoto({ url }: { url: string }) {
  const [failed, setFailed] = useState('')
  return <div className="rc-paper"><div className="rc-paperhead">接待原稿照片</div>
    {failed === url ? <p role="status">原图暂时无法读取，可以重新选择照片。</p> :
      /* eslint-disable-next-line @next/next/no-img-element */
      <img className="rc-original-photo" src={url} alt="当前工作单的接待原稿照片" onError={() => setFailed(url)} />}
  </div>
}
