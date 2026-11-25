import { useEffect, useRef, useState, type ReactNode } from 'react'
import { recognitionLabels, type RecognitionDifference, type RecognitionField } from '@/features/reception/mergeRecognition'
import { garments } from '@/features/reception/estimate'

function WorksheetValue({ value }: { value: RecognitionDifference['current'] }) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return <span>留空，待确认</span>
  if (!Array.isArray(value)) return <span>{value}</span>
  return <ul>{value.map((group, index) => <li key={index}>
    <strong>{group.heading}</strong>
    <div>{group.presentation === 'matrix' ? '颜色 × 尺码' : '逐行明细'} · {group.pricingKind === 'unlinked'
      ? '单独报价' : group.pricingKind ? garments[group.pricingKind] : '按服装描述估价'}</div>
    {group.rows.map((row, i) => <div key={i}>{row.colour || '未注明颜色'} / {row.size || '未注明尺码'} / {row.quantity ?? '待核'} 件</div>)}
    <div>{group.prints == null ? '印花待核' : !group.prints.length ? '仅计衣价' :
      group.prints.map(spec => `${spec.area || '位置待核'}（${spec.size || '大小待核'}）`).join('、')}</div>
    {group.notes && <div>{group.notes}</div>}
  </li>)}</ul>
}

export function RecognitionReview({ differences, original, onApply, onCancel }: {
  differences: RecognitionDifference[]
  original: ReactNode
  onApply: (accepted: ReadonlySet<RecognitionField>) => void
  onCancel: () => void
}) {
  const [accepted, setAccepted] = useState(new Set<RecognitionField>())
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  function select(field: RecognitionField, useIncoming: boolean) {
    setAccepted(previous => {
      const next = new Set(previous)
      if (useIncoming) next.add(field)
      else next.delete(field)
      return next
    })
  }
  return <section className="rc-recognition-review">
    <h1 tabIndex={-1} ref={heading}>核对识别差异</h1>
    <p>请选择要采用的值。识别到的新信息会补入空白字段。</p>
    <div className="rc-review"><div>{original}</div>
    <div>{differences.map(({ field, current, incoming }) => <fieldset key={field}>
      <legend>{recognitionLabels[field]}</legend>
      <div className="rc-review">{[false, true].map(useIncoming => <div key={String(useIncoming)}>
        <label className="rc-touch"><input name={field} type="radio" aria-describedby={`recognition-${field}-${useIncoming}`} checked={accepted.has(field) === useIncoming}
          onChange={() => select(field, useIncoming)}/>{useIncoming ? '使用识别值' : '保留现值'}</label>
        <div id={`recognition-${field}-${useIncoming}`}><WorksheetValue value={useIncoming ? incoming : current}/></div>
      </div>)}</div>
    </fieldset>)}</div></div>
    <div className="rc-actions rc-end"><button onClick={onCancel}>放弃本次结果</button>
      <button className="rc-primary" onClick={() => onApply(accepted)}>应用核对结果</button></div>
  </section>
}
