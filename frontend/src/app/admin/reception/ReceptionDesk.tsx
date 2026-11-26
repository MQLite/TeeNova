'use client'
import { PendingNotice } from './PendingNotice'
import { DeleteSheetButton } from './DeleteSheetButton'
import { GmailArtwork } from './GmailArtwork'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { blankWorksheet, hasSheetContent, missingSheetHeadings, todayInAuckland, type Worksheet } from '@/features/reception/worksheet'
import { ensureCaptureSource, recognizeCapture, type CaptureRequest } from '@/features/reception/recognize'
import { prepareReceptionPhoto } from '@/features/reception/photo'
import { emptyRecognitionValue, mergeRecognition, recognitionLabels, type RecognitionDifference, type RecognitionField } from '@/features/reception/mergeRecognition'
import { ensureMaterialSources, recognizeMaterials, type MaterialItem, type RecognitionSourceNote } from '@/features/reception/materials'
import { applyQuantityReview, isQuantityNote, prepareQuantityReview, type QuantityReview } from '@/features/reception/materialQuantityReview'
import { sourceContentUrl } from '@/api/ai-order-imports'
import { useReceptionEstimate } from '@/features/reception/useReceptionEstimate'
import { receptionPricingInputs } from '@/features/reception/estimate'
import { InkPad, type Stroke } from './InkPad'
import { GarmentEditor } from './GarmentEditor'
import { ReceptionPdfs, ReceptionPreview } from './ReceptionPdfs'
import { MaterialNotes, MaterialPreview, MaterialSources, MaterialTabs, ReceptionMaterialsEditor, useMaterialTabs, type MaterialPreviewTarget } from './ReceptionMaterials'
import { useReceptionMaterials } from './useReceptionMaterials'
import { ReceptionQueue } from './ReceptionQueue'
import { RecognitionReview, WorksheetValue } from './RecognitionReview'
import { OriginalText, StoredOriginalText, TextEditor, useTextOriginal } from './TextOriginal'
import { advanceSheet, fetchSheet, generateSheetPdf, saveSheet, stages, type SavedSheet, type SheetPdf, type Stage } from './sheets'
import { displayAmount, displayPayment, SheetAmounts } from './SheetAmounts'
import { ApiError } from '@/lib/api-client'
import { formatNzDate } from '@/lib/datetime'
import './reception.css'

type SaveRequest = { attempt: number; print: boolean; afterStroke: boolean }

const sourceFieldNames: [RegExp, RecognitionField][] = [
  [/layout|group|garment|size|quantity|qty|count|print|服装|尺码|印花|数量|件数|码数|恤|连帽衫/i, 'groups'],
  [/phone|mobile|电话|手机/i, 'phone'],
  [/pickup|取货|自取|日期/i, 'pickupDate'],
  [/payment|paid|eftpos|cash|transfer|实付|付款|收款/i, 'payments'],
  [/deposit|订金|定金/i, 'deposit'],
  [/amount|total|总价|费用|金额/i, 'totalPrice'],
  [/customer|客户|姓名|顾客/i, 'customer'],
  [/title|标题/i, 'title'],
  [/instruction|note|制作说明|备注/i, 'instructions'],
]

function reviewMaterialNotes(notes: RecognitionSourceNote[]) {
  const proposed = new Set<RecognitionField>()
  const unresolved = new Set<RecognitionField>()
  for (const note of notes) {
    if (note.kind === 'multipleCustomers') return { fields: new Set(Object.keys(recognitionLabels) as RecognitionField[]), suggested: new Set<RecognitionField>() }
    if (note.kind === 'evidence') continue
    const field = Object.hasOwn(recognitionLabels, note.field) ? note.field as RecognitionField :
      note.kind === 'possibleDuplicate' ? 'groups' : sourceFieldNames.find(([pattern]) => pattern.test(note.field))?.[1]
    if (!field) continue
    if (note.kind === 'correction') proposed.add(field)
    else unresolved.add(field)
  }
  return { fields: new Set([...proposed, ...unresolved]), suggested: new Set([...proposed].filter(field => !unresolved.has(field))) }
}

export function ReceptionDesk({ initialSheet }: { initialSheet?: string } = {}) {
  const openedFromLink = useRef<string>()
  const openAttempt = useRef(0)
  const [openingId, setOpeningId] = useState<string>()
  const [queueMessage, setQueueMessage] = useState('')
  const [view, setView] = useState<'write' | 'review' | 'queue'>('queue')
  const activeView = useRef(view)
  activeView.current = view
  const [sheet, setSheet] = useState<Worksheet>(blankWorksheet)
  const [received, setReceived] = useState(todayInAuckland)
  const [photo, setPhoto] = useState('')
  const [sourcePhotoUrl, setSourcePhotoUrl] = useState('')
  const [textMode, setTextMode] = useState(false)
  const textOriginal = useTextOriginal()
  const { openSource: openTextSource } = textOriginal
  const materials = useReceptionMaterials()
  const { openSource: openMaterialSource } = materials
  const [materialPreview, setMaterialPreview] = useState<MaterialPreviewTarget>()
  const [materialNotes, setMaterialNotes] = useState<RecognitionSourceNote[]>([])
  const [materialQuantityUnlocated, setMaterialQuantityUnlocated] = useState(false)
  const materialTabs = useMaterialTabs()
  const { reset: resetMaterialTabs } = materialTabs
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
  const [drawing, setDrawing] = useState(false)
  const saveRequest = useRef<SaveRequest>()
  const [conflict, setConflict] = useState(false)
  const [recovered, setRecovered] = useState<SavedSheet>()
  const [padKey, setPadKey] = useState(0)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'failed'>('idle')
  const [pdfPending, setPdfPending] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [generatedPdfs, setGeneratedPdfs] = useState<SheetPdf[]>([])
  const [previewPdf, setPreviewPdf] = useState<SheetPdf>()
  const pdfAttempt = useRef<number>()
  const [recognitionFailed, setRecognitionFailed] = useState(false)
  const editRevision = useRef(0)
  const [pendingRecognition, setPendingRecognition] = useState<{
    incoming: Worksheet; differences: RecognitionDifference[]; reviewMissing: boolean; textKey?: string; materialsKey?: string
    reviewFields?: ReadonlySet<RecognitionField>; initiallyAccepted?: ReadonlySet<RecognitionField>; fromMaterials?: boolean
    quantities?: QuantityReview[]
  }>()
  const lastAppliedTextKey = useRef<string>()
  const lastAppliedMaterialsKey = useRef<string>()
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
    setDrawing(false)
    setHasInk(ink)
    setPhoto(ink ? element.toDataURL('image/png') : '')
  }, [])

  function markDirty() {
    editRevision.current++
    setDirty(true)
  }

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
      setDrawing(false)
      markDirty()
    } catch (e) { setError(e instanceof Error ? e.message : '照片读取失败。') }
    finally { setBusy('') }
  }
  function useHandwriting() {
    if (!window.confirm('移除当前照片，改用手写接单？')) return
    setSourcePhotoUrl(''); setError(''); markDirty()
    job.current = undefined; recognized.current = false
  }
  function changeCaptureMode(useText: boolean) {
    materials.setActive(false)
    setTextMode(useText)
    recognized.current = false
    setError('')
    setRecognitionFailed(false)
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
    setRecognitionFailed(false)
    markDirty()
  }
  function editMaterials() {
    if (controller.current) {
      controller.current.abort()
      controller.current = undefined
      setBusy('')
    }
    setMaterialNotes([])
    setMaterialQuantityUnlocated(false)
    setError('')
    setRecognitionFailed(false)
    recognized.current = false
    markDirty()
  }
  function addMaterials(files: File[], method: MaterialItem['method']) {
    if (materials.add(files, method)) editMaterials()
  }
  async function retryMaterialUpload() {
    if (busy || materials.validation || !materials.items.length) return
    const attempt = openAttempt.current
    const batch = materials.getJob()
    setError('')
    setRecognitionFailed(false)
    setBusy('正在重新上传材料…')
    try { await ensureMaterialSources(batch, undefined, materials.report(batch)) }
    catch (e) { if (openAttempt.current === attempt) setError(e instanceof Error ? e.message : '材料上传失败。') }
    finally { if (openAttempt.current === attempt) setBusy('') }
  }
  const canRecognize = materials.active ? materials.items.length > 0 && !materials.validation && !materials.items.some(item => item.saved?.expired)
    : textMode ? textOriginal.valid : !!sourcePhotoUrl || hasInk
  async function recognize() {
    if (!canRecognize || busy || controller.current) return
    if (hasSheetContent(sheet) && !window.confirm('现在识别原稿？空白字段将自动补齐，有差异的内容可逐项核对。')) return
    setError('')
    setRecognitionFailed(false)
    setBusy(materials.active ? '正在准备所选材料…' : textMode ? '准备文字原稿…' : '准备手稿…')
    const token = new AbortController()
    controller.current = token
    try {
      const progress = (text: string) => { if (!token.signal.aborted) setBusy(text) }
      if (materials.active) {
        const batch = materials.getJob()
        const { sourceNotes = [], ...recognizedSheet } = await recognizeMaterials(batch, token.signal, progress, materials.report(batch, token.signal))
        if (token.signal.aborted) return
        setMaterialNotes(sourceNotes)
        const reviewMissing = !!record?.materials ||
          (!!lastAppliedMaterialsKey.current && lastAppliedMaterialsKey.current !== batch.key)
        const mixedCustomers = sourceNotes.some(note => note.kind === 'multipleCustomers')
        const quantityNotes = sourceNotes.filter(note => note.kind !== 'evidence' && isQuantityNote(note))
        const quantityReview = mixedCustomers ? { incoming: recognizedSheet, quantities: [], locationUnknown: false } :
          prepareQuantityReview(sheet, recognizedSheet, quantityNotes, reviewMissing)
        const { incoming, quantities, locationUnknown } = quantityReview
        setMaterialQuantityUnlocated(locationUnknown)
        const { fields, suggested } = reviewMaterialNotes(mixedCustomers ? sourceNotes : sourceNotes.filter(note => !quantityNotes.includes(note)))
        const merged = mergeRecognition(sheet, incoming, undefined, reviewMissing, fields)
        if (merged.differences.length || quantities.length || sourceNotes.some(note => note.kind !== 'evidence')) {
          const initiallyAccepted = new Set(merged.differences.filter(difference =>
            suggested.has(difference.field) && emptyRecognitionValue(difference.current)).map(difference => difference.field))
          setPendingRecognition({ incoming, differences: merged.differences, reviewMissing, reviewFields: fields,
            initiallyAccepted, fromMaterials: true, materialsKey: batch.key, quantities })
        } else {
          applyRecognition(merged.sheet, undefined, batch.key)
        }
        review()
        return
      }
      let capture = textMode ? textOriginal.capture() : job.current
      if (!capture) {
        const blob = await new Promise<Blob | null>(resolve => canvas.current!.toBlob(resolve, 'image/png'))
        token.signal.throwIfAborted()
        if (!blob) throw new Error('无法读取手稿，请重试。')
        capture = job.current = { key: crypto.randomUUID(), file: new File([blob], 'reception-note.png', { type: 'image/png' }) }
      }
      const result = await recognizeCapture(capture, token.signal, progress)
      if (token.signal.aborted) return
      const textKey = textMode ? capture.key : undefined
      // A revised transcript can withdraw a value. Let the operator decide before clearing it.
      const reviewMissing = textMode && textOriginal.edited && lastAppliedTextKey.current !== textKey &&
        Boolean(lastAppliedTextKey.current || record?.sourceText)
      const merged = mergeRecognition(sheet, result, undefined, reviewMissing)
      if (merged.differences.length) {
        setPendingRecognition({ incoming: result, differences: merged.differences, reviewMissing, textKey })
      } else {
        applyRecognition(merged.sheet, textKey)
      }
      review()
    } catch (e) {
      if (!token.signal.aborted) {
        setError(e instanceof Error ? e.message : '识别失败，可以手动填写。')
        setRecognitionFailed(true)
      }
    }
    finally {
      if (controller.current === token) controller.current = undefined
      if (!token.signal.aborted) setBusy('')
    }
  }
  function applyRecognition(next: Worksheet, textKey?: string, materialsKey?: string) {
    if (textKey) lastAppliedTextKey.current = textKey
    if (materialsKey) lastAppliedMaterialsKey.current = materialsKey
    setSheet(next)
    setPendingRecognition(undefined)
    recognized.current = true
    markDirty()
  }
  function manual() {
    controller.current?.abort()
    controller.current = undefined
    setBusy('')
    setError('')
    setRecognitionFailed(false)
    review()
  }
  function requestSave(print = false) {
    if (busy || saveRequest.current || !canSave || (print ? pdfAttempt.current !== undefined : !dirty)) return
    const attempt = openAttempt.current
    if (print && record && !dirty && !drawing) {
      void generatePdf(record, attempt, editRevision.current)
      return
    }
    const request = { attempt, print, afterStroke: drawing }
    saveRequest.current = request
    setSaveState('saving')
    setError('')
    if (print) setPdfError('')
    if (drawing) {
      setBusy('完成当前笔画后保存…')
      return
    }
    void save(request)
  }
  async function save(request: SaveRequest) {
    const revision = editRevision.current
    const handwriting = strokes.current
    const photoCapture = sourcePhotoUrl ? job.current : undefined
    const textCapture = textOriginal.edited && textOriginal.valid ? textOriginal.capture() : undefined
    const replaceMaterials = materials.edited
    const materialBatch = replaceMaterials && materials.items.length ? materials.getJob() : undefined
    const frozenQuote = record?.printEstimate
    const keepFrozenQuote = frozenQuote && (estimate.printText === '待估价' || estimate.printText === '待核价') &&
      receptionPricingInputs(sheet.layout, sheet.instructions) === receptionPricingInputs(record.layout, record.instructions)
    const printEstimate = keepFrozenQuote ? frozenQuote : estimate.printText
    const id = sheetId.current ??= crypto.randomUUID()
    setBusy('正在保存…')
    try {
      const source = photoCapture ? await ensureCaptureSource(photoCapture) : undefined
      const sourceText = textCapture ? await ensureCaptureSource(textCapture) : textOriginal.source ?? undefined
      if (request.attempt !== openAttempt.current) return
      const linkedMaterials = materialBatch ? await ensureMaterialSources(materialBatch, undefined, materials.report(materialBatch)) : null
      if (request.attempt !== openAttempt.current) return
      const updated = await saveSheet(id, { ...sheet, printEstimate,
        ...(replaceMaterials && { materials: linkedMaterials, replaceMaterials: true }) }, handwriting, record?.version, source, sourceText)
      if (request.attempt !== openAttempt.current) return
      setRecord(updated)
      setConflict(false)
      setSaveState('idle')
      if (editRevision.current === revision) {
        if (replaceMaterials) materials.acknowledge(updated.materials)
        setDirty(false)
        if (request.print) void generatePdf(updated, request.attempt, revision)
      } else if (request.print) {
        setError('保存期间有新的修改，请再次点击打印以保存最新内容。')
      }
    } catch (e) {
      if (request.attempt !== openAttempt.current) return
      setError(e instanceof Error ? e.message : '保存失败，可以重试。')
      setConflict(e instanceof ApiError && e.status === 409)
      setSaveState('failed')
    } finally {
      if (saveRequest.current === request) saveRequest.current = undefined
      if (request.attempt === openAttempt.current) setBusy('')
    }
  }
  async function generatePdf(saved: SavedSheet, attempt: number, revision: number) {
    if (pdfAttempt.current !== undefined) return
    pdfAttempt.current = attempt
    setPdfPending(true)
    setPdfError('')
    setPreviewPdf(undefined)
    try {
      const pdf = await generateSheetPdf(saved.id, saved.version)
      if (attempt !== openAttempt.current) return
      setGeneratedPdfs(current => [pdf, ...current.filter(file => file.id !== pdf.id)])
      if (!pdf.isCurrent) {
        if (editRevision.current === revision) {
          setConflict(true)
          setError('工单已在另一处更新。此 PDF 已存为旧版，请重新载入工单后打印当前版本。')
        }
        return
      }
      if (editRevision.current === revision && activeView.current === 'review') setPreviewPdf(pdf)
    } catch (e) {
      if (attempt === openAttempt.current) {
        if (e instanceof ApiError && e.status === 409) {
          setConflict(true)
          setError('工单已在另一处更新，请重新载入工单后打印当前版本。')
        } else {
          setPdfError(`工单已保存，PDF 生成失败。${e instanceof Error ? e.message : ''}`)
        }
      }
    } finally {
      if (pdfAttempt.current === attempt) {
        pdfAttempt.current = undefined
        setPdfPending(false)
      }
    }
  }
  function newSheet() {
    if (dirty &&
        !window.confirm('开始下一张将清空当前未保存的手稿和摘要，是否继续？')) return
    setQueueMessage('')
    resetSheet()
  }
  function resetSheet() {
    openAttempt.current++
    setOpeningId(undefined)
    controller.current?.abort()
    controller.current = undefined
    setPendingRecognition(undefined)
    setRecognitionFailed(false)
    saveRequest.current = undefined
    pdfAttempt.current = undefined
    setSaveState('idle'); setPdfPending(false); setPdfError(''); setGeneratedPdfs([]); setPreviewPdf(undefined)
    lastAppliedTextKey.current = undefined
    lastAppliedMaterialsKey.current = undefined
    setRecord(undefined); setSheet(blankWorksheet); setHasInk(false); setDirty(false)
    setSourcePhotoUrl('')
    setTextMode(false); openTextSource()
    openMaterialSource(); setMaterialPreview(undefined); setMaterialNotes([]); setMaterialQuantityUnlocated(false); resetMaterialTabs()
    strokes.current = []; setInitialStrokes([]); setConflict(false); setRecovered(undefined)
    setPhoto(''); setError(''); setView('write'); setReceived(todayInAuckland())
    canvas.current = undefined; sheetId.current = undefined; job.current = undefined; recognized.current = false
    setPadKey(k => k + 1)
  }
  async function recoverFirstSave() {
    if (busy || record || !sheetId.current) return
    setBusy('正在找回工单…')
    try {
      const saved = await fetchSheet(sheetId.current)
      setRecovered(saved)
      setError('')
      review()
    } catch (e) { setError(e instanceof Error ? e.message : '找回失败，请重试。') }
    finally { setBusy('') }
  }
  const open = useCallback(async (id: string) => {
    setQueueMessage('')
    if (dirty && !window.confirm('打开已保存版本会替换当前未保存的修改，是否继续？')) return
    const attempt = ++openAttempt.current
    controller.current?.abort()
    controller.current = undefined
    saveRequest.current = undefined
    pdfAttempt.current = undefined
    setSaveState('idle'); setPdfPending(false); setPdfError(''); setGeneratedPdfs([]); setPreviewPdf(undefined)
    setRecognitionFailed(false)
    setOpeningId(id)
    setBusy('正在打开工单…')
    setError('')
    try {
      const next = await fetchSheet(id)
      if (openAttempt.current !== attempt) return
      setPendingRecognition(undefined)
      lastAppliedTextKey.current = undefined
      lastAppliedMaterialsKey.current = undefined
      setRecord(next)
      setDrawing(false)
      setRecovered(undefined)
      sheetId.current = next.id
      setSheet({customer: next.customer, phone: next.phone, pickupDate: next.pickupDate ?? '',
        instructions: next.instructions, totalPrice: next.totalPrice, deposit: next.deposit, payments: next.payments, layout: next.layout})
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
      openMaterialSource(next.materials)
      setMaterialPreview(undefined); setMaterialNotes([]); setMaterialQuantityUnlocated(false); resetMaterialTabs()
      if (next.sourcePhoto) job.current = { key: crypto.randomUUID(), source: next.sourcePhoto }
    } catch (e) {
      if (openAttempt.current === attempt) setError(e instanceof Error ? e.message : '打开失败。')
    }
    finally {
      if (openAttempt.current === attempt) { setOpeningId(undefined); setBusy('') }
    }
  }, [dirty, openTextSource, openMaterialSource, resetMaterialTabs])
  useEffect(() => {
    if (!initialSheet || openedFromLink.current === initialSheet) return
    openedFromLink.current = initialSheet
    void open(initialSheet)
  }, [initialSheet, open])
  async function changeStage(stage: Stage) {
    if (!record || busy || dirty || conflict || stage === record.stage) return
    editRevision.current++
    setBusy('正在更新状态…')
    setError('')
    try {
      setRecord(await advanceSheet(record.id, stage, record.version))
      setQueueMessage('工单 #' + record.id.slice(0, 8) + ' 已更新为「' + stages[stage] + '」。')
      setView('queue')
    } catch (e) {
      setError(e instanceof Error ? e.message : '状态更新失败。')
      setConflict(e instanceof ApiError && e.status === 409)
    }
    finally { setBusy('') }
  }
  const missing = missingSheetHeadings(sheet.layout)
  sheet.payments?.forEach((p, i) => {
    if (p.amount == null || !p.method) missing.push(`第 ${i + 1} 笔实际付款的金额和方式`)
  })
  const hasContent = hasSheetContent(sheet)
  const estimate = useReceptionEstimate(sheet.layout, sheet.instructions)
  const hasOtherContent = hasContent || !!sourcePhotoUrl || !!record || textOriginal.valid || !!materials.items.length
  const invalidTextEdit = textOriginal.edited && !textOriginal.valid &&
    (!!textOriginal.text || !!textOriginal.source || !!record?.sourceText)
  const invalidMaterials = materials.edited ? materials.validation : ''
  const canSave = !recovered && !invalidTextEdit && !invalidMaterials && !missing.length && (hasOtherContent || hasInk || drawing)
  const saveLabel = saveState === 'saving' ? '保存中' : saveState === 'failed' ? '保存失败' :
    dirty ? '有未保存修改' : record ? '已保存' : '草稿'
  const displayState = (record ? stages[record.stage] + ' · ' : '') + saveLabel
  const saveTone = saveState !== 'idle' ? saveState : dirty ? 'dirty' : record ? 'saved' : 'draft'
  const recognizing = !!busy && !!controller.current
  const editsLocked = !!busy && saveState !== 'saving'
  function edit<K extends keyof Worksheet>(key: K, value: Worksheet[K]) {
    setSheet(current => ({...current, [key]: value}))
    markDirty()
  }
  function inkChanged(element: HTMLCanvasElement, ink: boolean, lines: Stroke[]) {
    canvas.current = element
    strokes.current = lines
    setDrawing(false)
    setHasInk(ink)
    job.current = undefined
    recognized.current = false
    markDirty()
    if (saveRequest.current?.afterStroke) {
      const request = saveRequest.current
      request.afterStroke = false
      if (!invalidTextEdit && !invalidMaterials && !missing.length && (hasOtherContent || ink)) void save(request)
      else {
        saveRequest.current = undefined
        setSaveState('idle')
        setBusy('')
      }
    }
  }
  const originalImage = sourcePhotoUrl || photo
    ? <OriginalPhoto url={sourcePhotoUrl || photo} handwriting={!sourcePhotoUrl} compact={!pendingRecognition} />
    : null
  const original = textOriginal.hasOriginal
    ? <><OriginalText value={textOriginal}/>{originalImage}</> : originalImage
  const materialSources = <MaterialSources value={materials} onPreview={setMaterialPreview}/>
  const sourceNotes = <MaterialNotes notes={materialNotes} value={materials} onPreview={setMaterialPreview}/>
  const materialSelectionLocked = editsLocked && !recognizing
  return <div className="reception-desk" lang="zh-CN">
    <header className="rc-mast"><strong>OtahuhuPrintingShop</strong><span>接待工作台</span></header>
    <nav aria-label="接待导航">{([['queue','工单总览'], ['write','接单录入'], ['review','核对工作单']] as const).map(([tab,label]) =>
      <button key={tab} disabled={!!busy || !!pendingRecognition || !!recovered} aria-current={view === tab ? 'page' : undefined} onClick={() => { setError(''); if (tab === 'review') review(); else setView(tab) }}>{label}</button>)}
      <a href="/admin/reception/pending">待关联设计稿</a></nav>
    <div className="rc-body">
      {error && <p className="rc-error" role="alert">{error}
        {conflict && !recovered && (record ? <button disabled={!!busy} onClick={() => void open(record.id)}>重新载入工单</button> :
          sheetId.current && <button disabled={!!busy} onClick={() => void recoverFirstSave()}>找回已保存工单</button>)}
        {view === 'write' && recognitionFailed && <button type="button" disabled={!!busy || !canRecognize} onClick={() => void recognize()}>重试识别</button>}</p>}
      {recognizing ? <aside className="rc-recognition-progress" aria-label="整理工作单进度" role="region">
        <div className="rc-progress-heading"><span className="rc-spinner" aria-hidden="true"/><strong>正在整理工作单</strong></div>
        <p role="status">{busy}</p>
        <button type="button" onClick={manual}>转为手动填写</button>
      </aside> : busy && <p role="status">{busy}</p>}
      {recovered && <section className="rc-column" aria-label="服务器已保存版本">
        <h2>服务器已保存版本</h2>
        <p>请对照下方的本地草稿。保留本地修改后，点击「保存修改」才会更新这张工单。</p>
        <dl className="rc-fields">{[
          ['客户姓名', recovered.customer], ['联系电话', recovered.phone], ['预计可取日期', recovered.pickupDate],
          ['总价', displayAmount(recovered.totalPrice)], ['订金', displayAmount(recovered.deposit)],
          ['实际已付款', recovered.payments?.map(displayPayment).join('、')],
          ['工作单标题', recovered.layout?.title], ['制作说明', recovered.instructions],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '未填写'}</dd></div>)}</dl>
        {!!recovered.layout?.groups.length && <details><summary>已保存的服装分组</summary>
          <WorksheetValue value={recovered.layout.groups}/></details>}
        {recovered.sourcePhoto && <OriginalPhoto url={sourceContentUrl(recovered.sourcePhoto.importId, recovered.sourcePhoto.documentId)}/>}
        {recovered.sourceText && <StoredOriginalText source={recovered.sourceText}/>}
        {recovered.materials && <div><strong>已保存材料</strong>
          <ul>{recovered.materials.files.map(file => <li key={file.id}>{file.name}{file.expired ? ' · 原件已到期' : ''}</li>)}</ul>
          {recovered.materials.description && <p>{recovered.materials.description}</p>}
        </div>}
        {!!recovered.handwriting?.length && <details><summary>已保存的手写原稿</summary>
          <InkPad initialStrokes={recovered.handwriting} disabled toolbarHost={null} onReady={ignoreInk} onChange={ignoreInk}/></details>}
        <div className="rc-actions"><button disabled={!!busy} onClick={() => {
          setRecord(recovered); setReceived(formatNzDate(recovered.creationTime, {year:'numeric',month:'short',day:'numeric'}))
          if (!textOriginal.edited && recovered.sourceText) openTextSource(recovered.sourceText)
          if (!materials.edited && recovered.materials) openMaterialSource(recovered.materials)
          setRecovered(undefined); setConflict(false); setError('')
        }}>保留本地修改，继续编辑</button>
        <button disabled={!!busy} onClick={() => void open(recovered.id)}>采用服务器版本</button></div>
      </section>}
      <section hidden={view !== 'write'}>
        <div className="rc-heading"><div><small>{received}</small><h1>接待手记</h1></div>
          {view === 'write' && <span className="rc-sheet-state" data-tone={saveTone} aria-live="polite">{displayState}</span>}</div>
        <div className="rc-tools" ref={setCaptureTools}>
          <input ref={cameraInput} hidden type="file" aria-label="拍摄接待原稿" accept="image/*" capture="environment" onChange={e => void selectPhoto(e.currentTarget, 'Camera')} />
          <input ref={galleryInput} hidden type="file" aria-label="选择接待原稿照片" accept="image/jpeg,image/png,image/webp" onChange={e => void selectPhoto(e.currentTarget, 'Upload')} />
          {!materials.active && <>
            <button disabled={!!busy} onClick={() => cameraInput.current?.click()}>{sourcePhotoUrl ? '重新拍照' : '拍照'}</button>
            <button disabled={!!busy} onClick={() => galleryInput.current?.click()}>从相册选择</button>
          </>}
          <button aria-pressed={textMode && !materials.active} disabled={!!busy || drawing} onClick={() => changeCaptureMode(true)}>粘贴文字</button>
          <button aria-pressed={materials.active} disabled={!!busy || drawing} onClick={() => {
            materials.setActive(true); recognized.current = false; setError(''); setRecognitionFailed(false)
          }}>从文件生成工作单</button>
          {textMode || materials.active ? <button disabled={!!busy} onClick={() => changeCaptureMode(false)}>{sourcePhotoUrl ? '返回照片' : '返回手写'}</button>
            : sourcePhotoUrl && <button disabled={!!busy} onClick={useHandwriting}>改用手写</button>}
        </div>
        {materials.active && view === 'write' && <ReceptionMaterialsEditor value={materials} disabled={materialSelectionLocked}
          onAdd={addMaterials} onRemove={key => { materials.remove(key); editMaterials() }}
          onNote={note => { materials.setNote(note); editMaterials() }} onPreview={setMaterialPreview} onRetry={() => void retryMaterialUpload()}/>}
        {!materials.active && textMode && view === 'write' && <TextEditor value={textOriginal} onChange={editText} disabled={editsLocked && !recognizing}/>}
        {!materials.active && textMode && invalidTextEdit && !textOriginal.text.trim() && <p className="rc-error">请填写文字原稿后保存。</p>}
        {!materials.active && textMode && textOriginal.edited && dirty && record?.sourceText && <button disabled={!!busy}
          onClick={() => { recognized.current = false; openTextSource(record.sourceText) }}>恢复已保存的原文</button>}
        <div hidden={textMode || materials.active}>{sourcePhotoUrl ? <OriginalPhoto url={sourcePhotoUrl} /> : <InkPad key={padKey} toolbarHost={view === 'write' && !textMode && !materials.active ? captureTools : null}
          initialStrokes={initialStrokes} onReady={ready} disabled={editsLocked} onStrokeStart={() => {
            setDrawing(true)
            markDirty()
          }} onChange={inkChanged}/>}</div>
        <fieldset disabled={editsLocked}><SheetAmounts sheet={sheet} onChange={edit} estimate={estimate}/></fieldset>
        {missing.length > 0 && <p className="rc-error" role="status">请到「核对工作单」补填{missing.join('、')}后保存。</p>}
        <div className="rc-actions rc-end">
          <button disabled={!!busy || !dirty || !canSave} onClick={() => requestSave()}>{record ? '保存修改' : '保存工单'}</button>
          {!recognizing && <button disabled={!!busy} onClick={manual}>手动填写</button>}
          <button className="rc-primary" disabled={!canRecognize || !!busy} onClick={() => recognized.current ? review() : void recognize()}>
            {materials.active ? '生成工作单草稿' : '整理成工作单'}</button></div>
      </section>
      {pendingRecognition && <RecognitionReview differences={pendingRecognition.differences}
        original={pendingRecognition.fromMaterials ? materialSources : original}
        compareOriginal={pendingRecognition.fromMaterials || textOriginal.hasOriginal}
        materialComparison={pendingRecognition.fromMaterials}
        initiallyAccepted={pendingRecognition.initiallyAccepted}
        quantities={pendingRecognition.quantities}
        quantityLocationUnknown={pendingRecognition.fromMaterials && materialQuantityUnlocated}
        sourceNotes={pendingRecognition.fromMaterials ? sourceNotes : undefined}
        onApply={(accepted, acceptedQuantities) => applyRecognition(applyQuantityReview(
          mergeRecognition(sheet, pendingRecognition.incoming, accepted, pendingRecognition.reviewMissing, pendingRecognition.reviewFields).sheet,
          pendingRecognition.quantities ?? [], acceptedQuantities), pendingRecognition.textKey, pendingRecognition.materialsKey)}
        onCancel={() => {
          setPendingRecognition(undefined)
          if (pendingRecognition.fromMaterials) { setMaterialNotes([]); setMaterialQuantityUnlocated(false) }
        }}/>}
      {view === 'review' && !pendingRecognition && <section className="rc-detail">
        <header className="rc-detail-header rc-heading">
          <div className="rc-detail-title"><h1>{record ? '编辑工作单' : '核对工作单'}</h1>
            <span className="rc-sheet-state" data-tone={saveTone} aria-live="polite">{displayState}</span></div>
          <div className="rc-actions">
            {record && <StageControl key={record.id + record.version} stage={record.stage}
              disabled={!!busy || dirty || conflict} dirty={dirty} onChange={changeStage}/>}
            <button disabled={!!busy || !dirty || !canSave} onClick={() => requestSave()}>{record ? '保存修改' : '保存到取货列表'}</button>
            <button className="rc-primary" disabled={!!busy || pdfPending || !canSave} onClick={() => requestSave(true)}>打印 / 保存 A4 PDF</button>
          </div>
        </header>
        {pdfPending && <p className="rc-pdf-feedback" aria-live="polite">正在生成 A4 PDF…</p>}
        {pdfError && <p className="rc-error" role="alert">{pdfError}{!dirty && <button type="button"
          disabled={!!busy || pdfPending} onClick={() => requestSave(true)}>重试生成 PDF</button>}</p>}
        {missing.length > 0 && <p className="rc-error" role="status">请补填{missing.join('、')}后保存或打印。</p>}
        {invalidTextEdit && <p className="rc-error">请到「接单录入」修改文字原稿后保存。</p>}
        {invalidMaterials && <p className="rc-error">{invalidMaterials}</p>}
        {!!materials.items.length && <MaterialTabs tabs={materialTabs}/>}
        <div className="rc-review rc-detail-grid" data-material-tab={materials.items.length ? materialTabs.tab : undefined}>
          <div className="rc-detail-aside">
            <div className="rc-source-pane">{materialSources}{original}</div>
            <fieldset disabled={editsLocked} className="rc-contact rc-order-pane"><legend>客户与取货</legend>
              <div className="rc-fields"><label>客户姓名<input value={sheet.customer} maxLength={160} onChange={e => edit('customer', e.target.value)}/></label>
                <label>联系电话<input type="tel" value={sheet.phone} maxLength={80} onChange={e => edit('phone', e.target.value)}/></label>
                <label>预计可取日期<input type="date" value={sheet.pickupDate} onChange={e => edit('pickupDate', e.target.value)}/></label></div>
              <SheetAmounts sheet={sheet} onChange={edit} estimate={estimate}/>
            </fieldset>
            <div className="rc-detail-tools rc-source-pane">
              <button disabled={!!busy || !!recovered} onClick={() => {
                if (materials.items.length) materials.setActive(true)
                setPreviewPdf(undefined); setView('write')
              }}>
                {materials.active || materials.items.length ? '编辑接待材料' : textMode ? '编辑原文' : sourcePhotoUrl ? '更换原稿' : '编辑手稿'}</button>
            </div>
            {record && <details className="rc-disclosure"><summary>设计稿</summary>
              <GmailArtwork key={record.id} sheetId={record.id} />
            </details>}
            {record && <ReceptionPdfs key={record.id} sheet={record} dirty={dirty} generated={generatedPdfs}
              preview={previewPdf} onPreview={setPreviewPdf}/>}
          </div>
          <fieldset disabled={editsLocked} className="rc-detail-editor rc-order-pane"><legend className="sr-only">服装与制作</legend>
            <GarmentEditor layout={sheet.layout} catalogue={estimate.catalogue} onChange={layout => edit('layout', layout)}/>
            <label>制作说明<textarea rows={1} value={sheet.instructions} maxLength={24000} onChange={e => edit('instructions', e.target.value)} placeholder="交付约定或整单备注"/></label>
            {materialQuantityUnlocated && <p className="rc-error">部分争议数量无法定位到唯一尺码。请对照原件核对并编辑。</p>}
            {sourceNotes}
          </fieldset>
        </div>
        <div className="rc-actions rc-end">
          {record && <DeleteSheetButton sheet={record} disabled={!!busy} dirty={dirty}
            onDeleted={() => {
              if (initialSheet === record.id) window.history.replaceState(window.history.state, '', '/admin/reception')
              setQueueMessage('已删除工单 #' + record.id.slice(0, 8))
              resetSheet(); setView('queue')
            }} />}
          <button disabled={!!busy} onClick={newSheet}>开始下一张</button>
        </div>
      </section>}
      {view === 'queue' && queueMessage && <p role="status">{queueMessage}</p>}
      {view === 'queue' && <PendingNotice />}
      <ReceptionQueue openingId={openingId} onOpen={id => void open(id)} onNew={newSheet} disabled={!!busy} active={view === 'queue'}/>
    </div>
    {materialPreview && <MaterialPreview target={materialPreview} description={materials.description} onClose={() => setMaterialPreview(undefined)}/>}
  </div>
}

const ignoreInk = () => {}

function OriginalPhoto({ url, handwriting = false, compact = false }: { url: string; handwriting?: boolean; compact?: boolean }) {
  const [failed, setFailed] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const id = useId()
  const src = attempt && url.startsWith('/api/') ? `${url}?retry=${attempt}` : url
  const title = handwriting ? '手写原稿' : '接待原稿照片'
  return <div className={compact ? 'rc-paper rc-original-compact' : 'rc-paper'}>
    <div className="rc-paperhead">{title}</div>
    {compact && <button className="rc-photo-toggle" type="button" aria-controls={id} aria-expanded={expanded}
      onClick={() => setExpanded(!expanded)}>{expanded ? '收起' : '展开'}{title}</button>}
    <div id={id} className={compact && !expanded ? 'rc-photo-folded' : undefined}>
      {failed === url ? <div className="rc-photo-error"><p role="status">原图暂时无法读取。</p>
        <button type="button" onClick={() => { setAttempt(n => n + 1); setFailed('') }}>重试加载</button></div> :
        <button className="rc-photo-zoom" type="button" aria-label={`放大${title}`} onClick={() => setZoomed(true)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="rc-original-photo" src={src} alt={`当前工作单的${title}`} onError={() => setFailed(url)} />
        </button>}
    </div>
    {zoomed && <ReceptionPreview title={title} onClose={() => setZoomed(false)}>
      <div className="rc-photo-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={title} />
      </div>
    </ReceptionPreview>}
  </div>
}

function StageControl({stage, disabled, dirty, onChange}: {
  stage: Stage; disabled: boolean; dirty: boolean; onChange: (next: Stage) => void
}) {
  const [next, setNext] = useState(stage)
  return <div className="rc-stage-control">
    <label>工单状态<select disabled={disabled} value={next} onChange={e => setNext(e.target.value as Stage)}>
      {Object.entries(stages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    {next !== stage && <button type="button" disabled={disabled} onClick={() => onChange(next)}>确认更改状态</button>}
    {dirty && <small>请先保存修改，再调整状态。</small>}
  </div>
}
