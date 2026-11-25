'use client'
import { useEffect, useState } from 'react'
import { adminApiClient } from '@/lib/admin-client'
import { ArtworkPreview, type Artwork } from './ArtworkPreview'
import { DeleteArtworkButton } from './DeleteSheetButton'

type Pending = Artwork & { sender: string; subject: string; received: string; newCustomer: string | null }
type Match = { id: string; customer: string; phoneEnd: string; pickupDate: string | null }
const endpoint = '/api/gmail-reception/pending'

export function PendingGmailArtwork({ onOpen = id => window.location.assign('/admin/reception?sheet=' + encodeURIComponent(id)) }: { onOpen?: (id: string) => void }) {
  const [items, setItems] = useState<Pending[]>([])
  const [selected, setSelected] = useState<Pending>()
  const [mode, setMode] = useState<'create' | 'link'>('create')
  const [text, setText] = useState('')
  const [matches, setMatches] = useState<Match[]>([])
  const [chosen, setChosen] = useState<Match>()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(true)
  useEffect(() => {
    const request = new AbortController()
    adminApiClient.get<Pending[]>(endpoint, {}, { signal: request.signal })
      .then(rows => { if (!request.signal.aborted) setItems(rows) })
      .catch(() => { if (!request.signal.aborted) setMessage('读取失败，请刷新待关联列表。') })
      .finally(() => { if (!request.signal.aborted) setBusy(false) })
    return () => request.abort()
  }, [])

  async function perform(fn: () => Promise<void>) {
    setBusy(true); setMessage('')
    try { await fn() } catch (e) { setMessage(e instanceof Error ? e.message : '操作失败，请重试。') }
    finally { setBusy(false) }
  }
  function load() {
    setSelected(undefined)
    void perform(async () => setItems(await adminApiClient.get<Pending[]>(endpoint)))
  }
  function choose(item: Pending, next: typeof mode) {
    setSelected(item); setMode(next); setText(item.newCustomer || ''); setMatches([]); setChosen(undefined); setMessage('')
  }
  function search() {
    void perform(async () => {
      const result = await adminApiClient.get<{ items: Match[]; more: boolean }>(endpoint + '/sheets', { search: text.trim() })
      setMatches(result.items); setChosen(undefined)
      if (!result.items.length) setMessage('没有匹配的工单。')
      else if (result.more) setMessage('显示前十张匹配工单，可输入更多字符缩小范围。')
    })
  }
  function save() {
    if (!selected || (mode === 'link' && !chosen)) return
    void perform(async () => {
      const suffix = mode === 'create' ? '/create' : '/link/' + chosen!.id
      const result = await adminApiClient.post<{sheetId: string}>(endpoint + '/' + selected.id + suffix,
        mode === 'create' ? {customer: text.trim()} : undefined)
      setItems(current => current.filter(item => item.id !== selected.id))
      setSelected(undefined); onOpen(result.sheetId)
    })
  }
  return <section aria-label="待关联设计稿">
    <fieldset disabled={busy}>
      <div className="rc-heading"><h1>待关联设计稿</h1><button onClick={load}>刷新待关联列表</button></div>
      {!busy && !items.length && !message && <p>暂无待关联设计稿。</p>}
      <div className="art-grid">{items.map(item => <article key={item.id} className="art-card">
        <ArtworkPreview file={item} base={'/api/proxy' + endpoint} />
        <p>{item.subject}</p><small>{item.sender ? item.sender + ' · ' : '退回时间 · '}{new Date(item.received).toLocaleString('zh-NZ',{timeZone:'Pacific/Auckland'})}</small>
        <div className="rc-actions"><button onClick={() => choose(item,'create')}>{item.newCustomer ? '继续开单' : '用此稿开新单'}</button>
          {!item.newCustomer && <><button onClick={() => choose(item,'link')}>关联已有工单</button>
            <DeleteArtworkButton name={item.name} path={endpoint + '/' + item.id} onDeleted={() => {
              setItems(current => current.filter(row => row.id !== item.id))
              if (selected?.id === item.id) setSelected(undefined)
            }} /></>}</div>
      {selected?.id === item.id && <div className="space-y-2 border-t py-3">
        <h3>{mode === 'create' ? '用此稿开新单' : '关联已有工单'} · {selected.name}</h3>
        <label>{mode === 'create' ? '新工单客户姓名' : '查找工单号、姓名或电话'}
          <input value={text} maxLength={160} readOnly={mode === 'create' && !!selected.newCustomer}
            onChange={e => { setText(e.target.value); setMatches([]); setChosen(undefined) }}/></label>
        {mode === 'link' && <><button disabled={text.trim().length < 2} onClick={search}>查找工单</button>
          {matches.map(row => <button key={row.id} aria-pressed={chosen?.id === row.id} onClick={() => setChosen(row)}>
            {row.customer || '未填写姓名'} · #{row.id.slice(0,8)} · {row.pickupDate || '取货日期待定'} {row.phoneEnd && '· 电话尾号 ' + row.phoneEnd}</button>)}
          {chosen && <p>已选工单：{chosen.customer} · #{chosen.id.slice(0,8)}</p>}</>}
        <div className="rc-actions"><button onClick={save} disabled={mode === 'create' ? !text.trim() : !chosen}>
          {mode === 'create' ? '创建工单并关联' : '确认关联'}</button>
          <button onClick={() => {setSelected(undefined); setMessage('')}}>取消</button></div>
      </div>}
      </article>)}</div>
    </fieldset>
    {busy && <p role="status">正在处理…</p>}{message && <p role="status">{message}</p>}
  </section>
}
