import { useState } from 'react'
import { missingSheetHeadings, totalPieces, type GarmentGroup, type PrintLayout, type SizeRow } from '@/features/reception/worksheet'
import { mixedGarmentSections } from '@/features/reception/garmentSummary'
import { defaultDoubleSidedPrintSize, garmentKind, garmentOnlyLabel, garments, type EstimateCatalogue } from '@/features/reception/estimate'
import { CombinedGarmentTable, printRequirements } from './GarmentTables'

const emptyRow = (): SizeRow => ({ colour: '', size: '', quantity: null })
const showPrintOptions = false

export function GarmentEditor({layout, catalogue, onChange}: {
  layout?: PrintLayout | null; catalogue?: EstimateCatalogue; onChange: (value: PrintLayout) => void
}) {
  const draft = layout ?? {title: '接待工作单', groups: []}
  const [editing, setEditing] = useState(false)
  const sections = mixedGarmentSections(layout)
  const canShowSummary = sections && !missingSheetHeadings(layout).length
  function changeDraft(value: PrintLayout) {
    // Adding or reclassifying a group must not replace the editor while someone is typing.
    setEditing(true)
    onChange(value)
  }
  const count = draft.groups.reduce((n, g) => n + g.rows.length, 0)
  function update(i: number, change: Partial<GarmentGroup>) {
    changeDraft({...draft, groups: draft.groups.map((g, j) => j === i ? {...g, ...change} : g)})
  }
  function rowChange(i: number, j: number, change: Partial<SizeRow>) {
    update(i, {rows: draft.groups[i].rows.map((r, k) => k === j ? {...r, ...change} : r)})
  }
  function removeGroup(i: number) {
    const name = draft.groups[i].heading.trim() || `第 ${i + 1} 组`
    if (!window.confirm(`删除整个「${name}」分组？本组尺码、制作要求和估价设置都将删除。`)) return
    changeDraft({...draft, groups: draft.groups.filter((_, j) => j !== i)})
  }
  function selectGarmentOnly(i: number) {
    const group = draft.groups[i]
    if (group.prints?.length && !window.confirm(`清除「${group.heading}」已有的印花规格？本组估价将仅含衣价，印花费需另计。`)) return
    update(i, {prints: []})
  }
  if (canShowSummary && !editing) return <>
    <div className="rc-garment-view-actions"><h2>{draft.title}</h2>
      <button type="button" onClick={() => setEditing(true)}>编辑服装明细</button></div>
    <CombinedGarmentTable sections={sections} catalogue={catalogue}/>
  </>
  return <div className="rc-editor">
    {canShowSummary && <div className="rc-garment-view-actions">
      <button type="button" onClick={() => setEditing(false)}>查看合并清单</button></div>}
    {layout && <label>工作单标题<input required aria-invalid={!draft.title.trim()} value={draft.title} maxLength={160} onChange={e => changeDraft({...draft, title: e.target.value})}/></label>}
    {draft.groups.map((g, i) => <section key={i} aria-label={g.heading || '服装明细'}>
      <div className="rc-fields rc-group-fields">
        <label>服装分组<input required aria-invalid={!g.heading.trim()} value={g.heading} maxLength={200} onChange={e => update(i, {heading: e.target.value})}/></label>
        <label>估价商品<select value={garmentKind(g)} onChange={e => update(i, {pricingKind:e.target.value as GarmentGroup['pricingKind']})}>
          {Object.entries(garments).map(([key,name]) => <option key={key} value={key}>{name}</option>)}
          <option value="unlinked">单独报价（含 Banner）</option>
        </select></label>
        <label>打印表格<select value={g.presentation} onChange={e => update(i, {presentation: e.target.value as GarmentGroup['presentation']})}>
          <option value="matrix">颜色 × 尺码</option><option value="rows">逐行明细</option></select></label>
      </div>
      {garmentKind(g) !== 'unlinked' && <div>
        {showPrintOptions && (g.prints ?? []).map((spec,j) => <div className="rc-tools" key={j}>
          {(['area','size'] as const).map(key => <label key={key}>{key === 'area' ? '印花位置' : '印花大小'}
            <select value={spec[key]} onChange={e => update(i,{prints:g.prints!.map((p,k) => k === j ? {...p,[key]:e.target.value} : p)})}>
              <option value="">{key === 'size' && defaultDoubleSidedPrintSize(g, spec.area)
                ? `按 ${defaultDoubleSidedPrintSize(g, spec.area)} 估价（未注明）` : '请选择'}</option>
              {(key === 'area' ? catalogue?.areas : catalogue?.sizes)?.map(o => <option key={o.id} value={o.code}>{o.name}</option>)}
            </select>
          </label>)}
          <button onClick={() => update(i,{prints:g.prints!.filter((_,k) => j !== k)})}>移除印花</button>
        </div>)}
        {showPrintOptions && <button disabled={(g.prints?.length ?? 0) >= 12} onClick={() => update(i,{prints:[...(g.prints ?? []),{area:'',size:''}]})}>添加印花</button>}
      </div>}
      <table className="rc-size-editor"><thead><tr><th>衣服颜色</th><th>尺码</th><th>数量</th><th aria-label="操作"/></tr></thead>
        <tbody>{g.rows.map((r, j) => <tr key={j}>
          <td><input aria-label={`第${j+1}行衣服颜色`} value={r.colour} maxLength={100} placeholder="未注明" onChange={e => rowChange(i,j,{colour:e.target.value})}/></td>
          <td><input aria-label={`第${j+1}行尺码`} value={r.size} maxLength={100} placeholder="未注明" onChange={e => rowChange(i,j,{size:e.target.value})}/></td>
          <td><input aria-label={`第${j+1}行数量`} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
            value={r.quantity ?? ''} placeholder="待核" onChange={e => {
              const value = e.target.value
              if (/^\d{0,6}$/.test(value)) rowChange(i,j,{quantity:value === '' ? null : Number(value)})
            }}/></td>
          <td><button type="button" aria-label={`删除第${j+1}行`} onClick={() =>
            update(i, {rows: g.rows.length === 1 ? [emptyRow()] : g.rows.filter((_, k) => k !== j)})}>×</button></td>
        </tr>)}</tbody></table>
      <div className="rc-actions rc-group-actions"><button disabled={g.rows.length >= 300 || count >= 500} onClick={() => update(i, {rows:[...g.rows, emptyRow()]})}>添加尺码</button>
        <strong>合计　{totalPieces(g.rows) ?? '待核'}{totalPieces(g.rows) !== null && ' 件'}</strong>
        {garmentKind(g) !== 'unlinked' && (g.prints?.length === 0 ? <small>{garmentOnlyLabel}</small> :
          <button type="button" onClick={() => selectGarmentOnly(i)}>选择{garmentOnlyLabel}</button>)}
        <button type="button" onClick={() => removeGroup(i)}>删除整个分组</button>
      </div>
      {!!g.prints?.length && <p className="rc-print-requirements">印花　{printRequirements(g, catalogue)}</p>}
      <label>本组制作要求<textarea rows={1} maxLength={4000} value={g.notes} onChange={e => update(i, {notes:e.target.value})}/></label>
    </section>)}
    <button disabled={draft.groups.length >= 40 || count >= 500} onClick={() => changeDraft({...draft, groups:[...draft.groups,
      {heading:'服装明细', presentation:'matrix', notes:'', rows:[emptyRow()]}]})}>添加服装分组</button>
  </div>
}
