'use client'

import { useEffect, useState } from 'react'
import { todayInAuckland } from '@/features/reception/worksheet'
import { fetchQueue, type SheetSummary, type Stage } from './sheets'
import { ArtworkPreview, sheetArtworkPath } from './ArtworkPreview'
import { displayAmount } from './SheetAmounts'

const headings: Record<Stage, string> = {Preparing: '待完成工单', Ready: '已做完 · 未取走', Collected: '已取走工单'}
const pageSize = 50

function TicketPayment({deposit, totalPrice}: Pick<SheetSummary, 'deposit' | 'totalPrice'>) {
  const paid = displayAmount(deposit)
  const total = displayAmount(totalPrice)
  return <span className="rc-ticket-payment" title={`订金 ${paid} / 总金额 ${total}`}>
    已付款 {paid} / {total}
  </span>
}

function QueueColumn({stage, date, search, onOpen, openingId, disabled, active}: {
  stage: Stage; date: string; search: string; openingId?: string; onOpen: (id: string) => void; disabled: boolean; active: boolean
}) {
  const [offset, setOffset] = useState(0)
  const [retry, setRetry] = useState(0)
  const [page, setPage] = useState<{items: SheetSummary[]; hasMore: boolean}>()
  const [error, setError] = useState('')
  useEffect(() => {
    setPage(undefined)
    setError('')
    if (!active) return
    const request = new AbortController()
    fetchQueue(stage, date, search, offset, request.signal).then(result => {
      if (request.signal.aborted) return
      if (offset > 0 && result.items.length === 0) setOffset(offset - pageSize)
      else setPage(result)
    }).catch(e => { if (!request.signal.aborted) setError(e.message) })
    return () => request.abort()
  }, [stage, date, search, offset, retry, active])
  if (!active) return null
  const today = todayInAuckland()
  return <section className={'rc-column rc-' + stage} aria-label={headings[stage]}>
    <h3>{headings[stage]}</h3>
    {error && <p role="alert">{error} <button onClick={() => setRetry(r => r + 1)}>重试</button></p>}
    {!page && !error && <p role="status">正在读取…</p>}
    {page?.items.length === 0 && <p>{search || date ? '没有匹配的工单。' : '暂无工单。'}</p>}
    {page?.items.map((sheet, i) => <div key={sheet.id}>
      {(i === 0 || page.items[i-1].pickupDate !== sheet.pickupDate) && <h4 className="rc-date">{sheet.pickupDate || '可取日期待定'}
        {stage === 'Preparing' && sheet.pickupDate && sheet.pickupDate < today && ' · 逾期'}</h4>}
      <div className="rc-ticket-row">
        <button className="rc-ticket" aria-busy={sheet.id === openingId || undefined} title={`打开工单 #${sheet.id.slice(0,8)}`}
          disabled={openingId ? sheet.id === openingId : disabled} onClick={() => onOpen(sheet.id)}>
          <strong title={sheet.customer}>{sheet.customer || '未填写姓名'}</strong>
          <span className="rc-ticket-phone" title={sheet.phone}>{sheet.phone || '未留联系方式'}</span>
          <TicketPayment deposit={sheet.deposit} totalPrice={sheet.totalPrice}/>
          <span className="sr-only">#{sheet.id.slice(0,8)}{sheet.id === openingId && ' · 正在打开…'}</span>
        </button>
        {!!sheet.artwork?.length && <div className="rc-ticket-art" role="group" aria-label="关联设计稿">{sheet.artwork.map(file =>
          <ArtworkPreview key={file.id} file={file} base={sheetArtworkPath(sheet.id)} compact />
        )}</div>}
      </div></div>)}
    {(offset > 0 || page?.hasMore) && <div className="rc-actions">
      <button disabled={disabled || !offset} onClick={() => setOffset(offset - pageSize)}>上一页</button>
      <button disabled={disabled || !page?.hasMore} onClick={() => setOffset(offset + pageSize)}>下一页</button></div>}
  </section>
}

export function ReceptionQueue({onOpen, onNew, disabled, active, openingId}: {
  onOpen: (id: string) => void; onNew: () => void; disabled: boolean; active: boolean; openingId?: string
}) {
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [date, setDate] = useState('')
  const [archive, setArchive] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), 200)
    return () => clearTimeout(timer)
  }, [text])
  const column = (stage: Stage) => <QueueColumn key={JSON.stringify([stage,date,search])} stage={stage}
    date={date} search={search} onOpen={onOpen} openingId={openingId} disabled={disabled}
    active={active && (stage !== 'Collected' || archive || search !== '')}/>
  return <section hidden={!active}><div className="rc-heading"><h1>工单总览</h1>
    <button className="rc-primary" disabled={disabled} onClick={onNew}>新建接待工单</button></div>
    <div className="rc-search"><label>搜索工单<input type="search" value={text} maxLength={160}
      placeholder="客户姓名、电话或工单号" onChange={e => setText(e.target.value.replace(/^#/, ''))}/></label>
      <label>可取日期<input type="date" value={date} onChange={e => setDate(e.target.value)}/></label>
      {(text || date) && <button onClick={() => { setText(''); setDate('') }}>清除筛选</button>}</div>
    <div className="rc-board">{column('Preparing')}{column('Ready')}</div>
    <details open={search !== '' || archive} onToggle={e => { if (!search) setArchive(e.currentTarget.open) }}>
      <summary>已取走记录</summary>{column('Collected')}</details>
  </section>
}
