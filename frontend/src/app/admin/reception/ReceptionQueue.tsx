'use client'

import { useEffect, useState } from 'react'
import { todayInAuckland } from '@/features/reception/worksheet'
import { fetchQueue, type SheetSummary, type Stage } from './sheets'
import { displayAmount } from './SheetAmounts'

const headings: Record<Stage, string> = {Preparing: '待完成工单', Ready: '已做完 · 未取走', Collected: '已取走工单'}

function QueueColumn({stage, date, search, onOpen, disabled}: {
  stage: Stage; date: string; search: string; onOpen: (id: string) => void; disabled: boolean
}) {
  const [offset, setOffset] = useState(0)
  const [retry, setRetry] = useState(0)
  const [page, setPage] = useState<{items: SheetSummary[]; hasMore: boolean}>()
  const [error, setError] = useState('')
  useEffect(() => {
    const request = new AbortController()
    setPage(undefined)
    setError('')
    fetchQueue(stage, date, search, offset, request.signal).then(result => {
      if (!request.signal.aborted) setPage(result)
    }).catch(e => { if (!request.signal.aborted) setError(e.message) })
    return () => request.abort()
  }, [stage, date, search, offset, retry])
  const today = todayInAuckland()
  return <section className={'rc-column rc-' + stage} aria-label={headings[stage]}>
    <h3>{headings[stage]}</h3>
    {error && <p role="alert">{error} <button onClick={() => setRetry(r => r + 1)}>重试</button></p>}
    {!page && !error && <p role="status">正在读取…</p>}
    {page?.items.length === 0 && <p>{search || date ? '没有匹配的工单。' : '暂无工单。'}</p>}
    {page?.items.map((sheet, i) => <div key={sheet.id}>
      {(i === 0 || page.items[i-1].pickupDate !== sheet.pickupDate) && <h4 className="rc-date">{sheet.pickupDate || '可取日期待定'}
        {stage === 'Preparing' && sheet.pickupDate && sheet.pickupDate < today && ' · 逾期'}</h4>}
      <button className="rc-ticket" disabled={disabled} onClick={() => onOpen(sheet.id)}>
        <span><strong>{sheet.customer || '未填写姓名'}</strong><small>#{sheet.id.slice(0,8)}</small></span>
        <span>总价 {displayAmount(sheet.totalPrice)}<small>订金 {displayAmount(sheet.deposit)}</small></span>
      </button></div>)}
    {(offset > 0 || page?.hasMore) && <div className="rc-actions">
      <button disabled={disabled || !offset} onClick={() => setOffset(offset - 50)}>上一页</button>
      <button disabled={disabled || !page?.hasMore} onClick={() => setOffset(offset + 50)}>下一页</button></div>}
  </section>
}

export function ReceptionQueue({onOpen, onNew, disabled, active}: {
  onOpen: (id: string) => void; onNew: () => void; disabled: boolean; active: boolean
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
    date={date} search={search} onOpen={onOpen} disabled={disabled}/>
  if (!active) return null
  return <section><div className="rc-heading"><h1>工单总览</h1>
    <button className="rc-primary" disabled={disabled} onClick={onNew}>新建接待工单</button></div>
    <div className="rc-search"><label>搜索工单<input type="search" value={text} maxLength={160}
      placeholder="客户姓名、电话或工单号" onChange={e => setText(e.target.value.replace(/^#/, ''))}/></label>
      <label>可取日期<input type="date" value={date} onChange={e => setDate(e.target.value)}/></label>
      {(text || date) && <button onClick={() => { setText(''); setDate('') }}>清除筛选</button>}</div>
    <div className="rc-board">{column('Preparing')}{column('Ready')}</div>
    <details open={search !== '' || archive} onToggle={e => { if (!search) setArchive(e.currentTarget.open) }}>
      <summary>已取走记录</summary>{(archive || search) && column('Collected')}</details>
  </section>
}
