import { totalPieces, type GarmentGroup, type PrintLayout, type SizeRow } from '@/features/reception/worksheet'

const emptyRow = (): SizeRow => ({ colour: '', size: '', quantity: null })

export function GarmentEditor({layout, onChange}: {
  layout?: PrintLayout | null; onChange: (value: PrintLayout) => void
}) {
  const draft = layout ?? {title: '接待工作单', groups: []}
  const count = draft.groups.reduce((n, g) => n + g.rows.length, 0)
  function update(i: number, change: Partial<GarmentGroup>) {
    onChange({...draft, groups: draft.groups.map((g, j) => j === i ? {...g, ...change} : g)})
  }
  function rowChange(i: number, j: number, change: Partial<SizeRow>) {
    update(i, {rows: draft.groups[i].rows.map((r, k) => k === j ? {...r, ...change} : r)})
  }
  function removeGroup(i: number) {
    onChange({...draft, groups: draft.groups.filter((_, j) => j !== i)})
  }
  return <div className="rc-editor">
    {layout && <label>工作单标题<input value={draft.title} maxLength={160} onChange={e => onChange({...draft, title: e.target.value})}/></label>}
    {draft.groups.map((g, i) => <section key={i} aria-label={g.heading || '服装明细'}>
      <div className="rc-fields"><label>服装分组<input value={g.heading} maxLength={200} onChange={e => update(i, {heading: e.target.value})}/></label>
        <label>打印表格<select value={g.presentation} onChange={e => update(i, {presentation: e.target.value as GarmentGroup['presentation']})}>
          <option value="matrix">颜色 × 尺码</option><option value="rows">逐行明细</option></select></label></div>
      <table><thead><tr><th>衣服颜色</th><th>尺码</th><th>数量</th><th aria-label="操作"/></tr></thead>
        <tbody>{g.rows.map((r, j) => <tr key={j}>
          <td><input aria-label={`第${j+1}行衣服颜色`} value={r.colour} maxLength={100} placeholder="未注明" onChange={e => rowChange(i,j,{colour:e.target.value})}/></td>
          <td><input aria-label={`第${j+1}行尺码`} value={r.size} maxLength={100} placeholder="未注明" onChange={e => rowChange(i,j,{size:e.target.value})}/></td>
          <td><input aria-label={`第${j+1}行数量`} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
            value={r.quantity ?? ''} placeholder="待核" onChange={e => {
              const value = e.target.value
              if (/^\d{0,6}$/.test(value)) rowChange(i,j,{quantity:value === '' ? null : Number(value)})
            }}/></td>
          <td><button type="button" aria-label={`删除第${j+1}行`} onClick={() => g.rows.length === 1
            ? removeGroup(i) : update(i, {rows:g.rows.filter((_, k) => k !== j)})}>×</button></td>
        </tr>)}</tbody></table>
      <div className="rc-actions"><button disabled={g.rows.length >= 300 || count >= 500} onClick={() => update(i, {rows:[...g.rows, emptyRow()]})}>添加尺码</button>
        <strong>合计　{totalPieces(g.rows) ?? '待核'}{totalPieces(g.rows) !== null && ' 件'}</strong></div>
      <label>本组制作要求<textarea rows={2} maxLength={4000} value={g.notes} onChange={e => update(i, {notes:e.target.value})}/></label>
    </section>)}
    <button disabled={draft.groups.length >= 40 || count >= 500} onClick={() => onChange({...draft, groups:[...draft.groups,
      {heading:'服装明细', presentation:'matrix', notes:'', rows:[emptyRow()]}]})}>添加服装分组</button>
  </div>
}
