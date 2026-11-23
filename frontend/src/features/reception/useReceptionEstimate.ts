import { useEffect, useState } from 'react'
import { formatPaymentAmount } from '@/lib/money'
import { defaultDoubleSidedPrintSize, garmentKind, loadEstimateCatalogue, quoteEstimate, type EstimateCatalogue } from './estimate'
import type { PrintLayout } from './worksheet'

export function useReceptionEstimate(layout: PrintLayout | null | undefined, instructions: string) {
  const linked = layout?.groups.some(g => garmentKind(g) !== 'unlinked') ?? false
  const [attempt, setAttempt] = useState(0)
  const [catalogue, setCatalogue] = useState<EstimateCatalogue>()
  const [catalogueError, setCatalogueError] = useState(false)
  const [result, setResult] = useState<{layout: PrintLayout; text: string}>()
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
      let text: string
      try { text = formatPaymentAmount(await quoteEstimate(layout.groups,catalogue,request.signal)) }
      catch (e) { text = e instanceof Error ? e.message : '暂时无法估价。' }
      if (!request.signal.aborted) setResult({layout,text})
    }, 350)
    return () => { clearTimeout(timer); request.abort() }
  }, [layout, catalogue, linked])
  const hasBanner = /banner|横幅|横额/i.test([instructions, layout?.title].join(' '))
  const excluded = hasBanner || layout?.groups.some(g => garmentKind(g) === 'unlinked')
  const text = !linked ? (excluded ? '单独报价' : '待录入服装')
    : catalogueError ? '无法读取系统价目。'
    : result && result.layout === layout ? result.text : '正在估价…'
  const garmentOnly = linked && layout?.groups.filter(g => garmentKind(g) !== 'unlinked')
    .every(g => g.prints?.length === 0)
  const defaults = new Set(layout?.groups.flatMap(g => g.prints?.filter(p => !p.size.trim())
    .map(p => defaultDoubleSidedPrintSize(g, p.area)) ?? []))
  const notes = [garmentOnly && '仅计衣价', defaults.has('A3') && '成人双面未注明大小按 A3 估价',
    defaults.has('A4') && '童装双面未注明大小按 A4 估价', linked && excluded && '其余单独报价'].filter(Boolean).join('，')
  const display = notes ? `${text}（${notes}）` : text
  return {catalogue, text: display, printText: text === '正在估价…' ? '待估价' : display,
    retry: linked ? () => setAttempt(n => n+1) : undefined}
}
