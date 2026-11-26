import { useEffect, useRef, useState, type ReactNode } from 'react'
import { emptyRecognitionValue, recognitionLabels, type RecognitionDifference, type RecognitionField } from '@/features/reception/mergeRecognition'
import { garments } from '@/features/reception/estimate'
import type { QuantityReview } from '@/features/reception/materialQuantityReview'
import { MaterialTabs, useMaterialTabs } from './ReceptionMaterials'

export function WorksheetValue({ value }: { value: RecognitionDifference['current'] }) {
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

export function RecognitionReview({ differences, original, compareOriginal = false, materialComparison = false, sourceNotes,
  initiallyAccepted, quantities = [], quantityLocationUnknown = false, onApply, onCancel }: {
  differences: RecognitionDifference[]
  original: ReactNode
  compareOriginal?: boolean
  materialComparison?: boolean
  sourceNotes?: ReactNode
  initiallyAccepted?: ReadonlySet<RecognitionField>
  quantities?: QuantityReview[]
  quantityLocationUnknown?: boolean
  onApply: (accepted: ReadonlySet<RecognitionField>, acceptedQuantities: ReadonlySet<string>) => void
  onCancel: () => void
}) {
  const [accepted, setAccepted] = useState(() => new Set(initiallyAccepted))
  const [acceptedQuantities, setAcceptedQuantities] = useState(() => new Set(quantities.filter(choice => choice.initiallyAccepted).map(choice => choice.key)))
  const [showOriginal, setShowOriginal] = useState(false)
  const tabs = useMaterialTabs()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  function select<T extends string>(previous: ReadonlySet<T>, field: T, useIncoming: boolean) {
    const next = new Set(previous)
    if (useIncoming) next.add(field)
    else next.delete(field)
    return next
  }
  return <section className="rc-recognition-review">
    <h1 tabIndex={-1} ref={heading}>核对识别差异</h1>
    <p>{differences.length || quantities.length ? '请选择要采用的值。请对照原件核对有争议的内容。' : '请对照原件核对识别结果。'}</p>
    {original && !compareOriginal && <>
      <button type="button" aria-expanded={showOriginal} aria-controls="recognition-original" onClick={() => setShowOriginal(!showOriginal)}>
        {showOriginal ? '收起原稿' : '查看原稿'}
      </button>
      <div id="recognition-original" hidden={!showOriginal}>{showOriginal && original}</div>
    </>}
    {materialComparison && <MaterialTabs tabs={tabs}/>}
    <div className={compareOriginal ? 'rc-review' : undefined} data-material-tab={materialComparison ? tabs.tab : undefined}>
    {compareOriginal && <div className="rc-source-pane">{original}</div>}
    <div className="rc-order-pane">{sourceNotes}
      {quantityLocationUnknown && <p className="rc-error">部分争议数量无法定位到唯一尺码。请在工单中对照原件核对并编辑。</p>}
      {quantities.map(choice => <fieldset key={choice.key}>
        <legend>{[choice.heading, choice.colour, choice.size, choice.occurrence && `第 ${choice.occurrence} 笔`].filter(Boolean).join(' · ')}</legend>
        {choice.current === null && choice.proposed === null ? <p>数量留空。可在工单中手动填写。</p> : <div className="rc-review">
          <label className="rc-touch"><input type="radio" name={choice.key} checked={!acceptedQuantities.has(choice.key)}
            onChange={() => setAcceptedQuantities(current => select(current, choice.key, false))}/>
            {choice.current === null ? '数量留空' : `保留数量 ${choice.current} 件`}</label>
          <label className="rc-touch"><input type="radio" name={choice.key} checked={acceptedQuantities.has(choice.key)}
            onChange={() => setAcceptedQuantities(current => select(current, choice.key, true))}/>
            {choice.proposed === null ? '清除数量' : `采用识别数量 ${choice.proposed} 件`}</label>
        </div>}
      </fieldset>)}
      {differences.map(({ field, current, incoming }) => <fieldset key={field}>
      <legend>{recognitionLabels[field]}</legend>
      <div className="rc-review">{[false, true].map(useIncoming => <div key={String(useIncoming)}>
        <label className="rc-touch"><input name={field} type="radio" aria-describedby={`recognition-${field}-${useIncoming}`} checked={accepted.has(field) === useIncoming}
          onChange={() => setAccepted(previous => select(previous, field, useIncoming))}/>
          {useIncoming ? (materialComparison && emptyRecognitionValue(incoming) ? '清除现值' : '使用识别值') : '保留现值'}</label>
        <div id={`recognition-${field}-${useIncoming}`}><WorksheetValue value={useIncoming ? incoming : current}/></div>
      </div>)}</div>
    </fieldset>)}</div></div>
    <div className="rc-actions rc-end"><button onClick={onCancel}>放弃本次结果</button>
      <button className="rc-primary" onClick={() => onApply(accepted, acceptedQuantities)}>应用核对结果</button></div>
  </section>
}
