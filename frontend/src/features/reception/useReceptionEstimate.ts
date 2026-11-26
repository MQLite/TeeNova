import { useEffect, useState } from 'react'
import { formatPaymentAmount } from '@/lib/money'
import { defaultDoubleSidedPrintSize, garmentKind, hasSeparateBanner, loadEstimateCatalogue, quoteEstimate, type EstimateCatalogue } from './estimate'
import type { PrintLayout } from './worksheet'

type EstimateResult = {layout: PrintLayout; status: 'quoted' | 'failed'; text: string}

export function useReceptionEstimate(layout: PrintLayout | null | undefined, instructions: string) {
  const linked = layout?.groups.some(g => garmentKind(g) !== 'unlinked') ?? false
  const [attempt, setAttempt] = useState(0)
  const [catalogue, setCatalogue] = useState<EstimateCatalogue>()
  const [catalogueError, setCatalogueError] = useState(false)
  const [result, setResult] = useState<EstimateResult>()
  useEffect(() => {
    setCatalogue(undefined)
    setCatalogueError(false)
    if (!linked) return
    const request = new AbortController()
    loadEstimateCatalogue(request.signal).then(value => {
      if (!request.signal.aborted) setCatalogue(value)
    }).catch(() => { if (!request.signal.aborted) setCatalogueError(true) })
    return () => request.abort()
  }, [linked, attempt])
  useEffect(() => {
    setResult(undefined)
    if (!layout || !catalogue || !linked) return
    const request = new AbortController()
    const timer = window.setTimeout(async () => {
      let next: EstimateResult
      try {
        const amount = await quoteEstimate(layout.groups, catalogue, request.signal)
        next = {layout, status: 'quoted', text: formatPaymentAmount(amount)}
      } catch (e) {
        next = {layout, status: 'failed', text: e instanceof Error ? e.message : '暂时无法估价。'}
      }
      if (!request.signal.aborted) setResult(next)
    }, 350)
    return () => { clearTimeout(timer); request.abort() }
  }, [layout, catalogue, linked])
  const hasBanner = hasSeparateBanner(layout, instructions)
  const excluded = hasBanner || layout?.groups.some(g => garmentKind(g) === 'unlinked')
  const currentResult = result?.layout === layout ? result : undefined
  const text = !linked ? (excluded ? '单独报价' : '待录入服装')
    : catalogueError ? '无法读取系统价目，请刷新估价。'
    : currentResult?.text ?? '正在估价…'
  const linkedGroups = layout?.groups.filter(g => garmentKind(g) !== 'unlinked') ?? []
  const garmentOnlyGroups = linkedGroups.filter(g => g.prints?.length === 0)
  const garmentOnlyNote = garmentOnlyGroups.length === 0 ? '' : garmentOnlyGroups.length === linkedGroups.length
    ? '仅计衣价，不含印花费' : garmentOnlyGroups.map(g => `「${g.heading}」不含印花费`).join('、')
  const defaults = new Set(linkedGroups.flatMap(g => g.prints?.filter(p => !p.size.trim())
    .map(p => defaultDoubleSidedPrintSize(g, p.area)) ?? []))
  const notes = [garmentOnlyNote, defaults.has('A3') && '成人双面未注明大小按 A3 估价',
    defaults.has('A4') && '童装双面未注明大小按 A4 估价', linked && excluded && '其余单独报价'].filter(Boolean).join('，')
  const display = notes ? `${text}（${notes}）` : text
  const printText = !linked ? display
    : catalogueError || currentResult?.status === 'failed' ? '待核价'
    : currentResult ? display : '待估价'
  return {catalogue, text: display, printText,
    retry: linked ? () => setAttempt(n => n+1) : undefined}
}
