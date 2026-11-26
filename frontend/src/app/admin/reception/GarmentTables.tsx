import { Fragment, useId } from 'react'
import { garments, garmentOnlyLabel, type EstimateCatalogue } from '@/features/reception/estimate'
import { alignAudienceMatrices, garmentSections, garmentSizeMatrix, type GarmentSection, type SizeMatrix } from '@/features/reception/garmentSummary'
import { matrixColumns, totalPieces, type GarmentGroup, type PrintLayout, type SizeRow } from '@/features/reception/worksheet'

export function printRequirements(group: GarmentGroup, catalogue?: EstimateCatalogue) {
  return group.prints?.map(spec => {
    const area = catalogue?.areas.find(item => item.code === spec.area)?.name ?? (spec.area || '位置待核')
    const size = catalogue?.sizes.find(item => item.code === spec.size)?.name ?? (spec.size || '大小待核')
    return `${area}（${size}）`
  }).join('、')
}

const count = (rows: SizeRow[]) => totalPieces(rows) ?? '待核'
const groupCount = (groups: GarmentGroup[]) => groups.some(group => !group.rows.length)
  ? '待核' : count(groups.flatMap(group => group.rows))

function MatrixRows({section, matrix, width}: {section: GarmentSection; matrix: SizeMatrix; width: number}) {
  const id = useId()
  const columns = matrix.designs.flatMap(({index, colours}) => colours.map(colour => ({...colour, index})))
  // Sections may have different numbers of designs. Keep the total in the same physical column.
  const span = (start: number, length = 1) => Math.floor((start + length) * width / columns.length) -
    Math.floor(start * width / columns.length)
  return <tbody>
    <tr className="rc-garment-audience"><th id={id} scope="rowgroup" colSpan={width + 2}>{section.label}</th></tr>
    <tr className="rc-garment-design"><th scope="col" rowSpan={2}>尺码</th>
      {matrix.designs.map(({label, index, colours}) => <th key={index} id={`${id}-g${index}`}
        colSpan={span(columns.findIndex(column => column.index === index), colours.length)}>{label}</th>)}
      <th scope="col" rowSpan={2}>合计</th></tr>
    <tr className="rc-garment-colour">{columns.map(({colour}, i) =>
      <th key={i} id={`${id}-c${i}`} scope="col" colSpan={span(i)}>{colour || '未注明衣色'}</th>)}</tr>
    {matrix.sizes.map((size, rowIndex) => {
      const rows = columns.flatMap(column => column.cells.get(size) ?? [])
      const rowId = `${id}-s${rowIndex}`
      return <tr key={size}><th id={rowId} scope="row">{size}</th>
        {columns.map(({cells, index}, i) => {
          const row = cells.get(size)
          return <td key={i} colSpan={span(i)} headers={`${id} ${rowId} ${id}-g${index} ${id}-c${i}`}>
            {row ? row.quantity ?? '待核' : '—'}</td>
        })}<td>{count(rows)}</td></tr>
    })}
    <tr className="rc-garment-subtotal"><th scope="row">{section.label}小计</th>
      {columns.map(({cells}, i) => <td key={i} colSpan={span(i)}>{cells.size ? count([...cells.values()]) : '—'}</td>)}
      <td>{groupCount(section.groups.map(({group}) => group))}</td></tr>
  </tbody>
}

function DetailRows({section}: {section: GarmentSection}) {
  return <tbody>
    <tr className="rc-garment-audience"><th scope="rowgroup" colSpan={4}>{section.label}</th></tr>
    <tr className="rc-garment-design">{['款式 / 图案', '衣服颜色', '尺码', '数量'].map(label => <th scope="col" key={label}>{label}</th>)}</tr>
    {section.groups.map(({group, index, label}) => <Fragment key={index}>
      {group.rows.length ? group.rows.map((row, i) => <tr key={i}>
        <th scope="row">{label}</th><td>{row.colour || '未注明'}</td>
        <td>{row.size || '未注明'}</td><td>{row.quantity ?? '待核'}</td>
      </tr>) : <tr><th scope="row">{label}</th><td colSpan={3}>尺码和数量待核</td></tr>}
    </Fragment>)}
    <tr className="rc-garment-subtotal"><th scope="row" colSpan={3}>{section.label}小计</th>
      <td>{groupCount(section.groups.map(({group}) => group))}</td></tr>
  </tbody>
}

export function CombinedGarmentTable({sections, catalogue}: {sections: GarmentSection[]; catalogue?: EstimateCatalogue}) {
  const mixedAudience = sections[0]?.label === '成人' && sections[1]?.label === '童装'
  const matrices = sections.map(section => !mixedAudience && section.groups.some(({group}) => group.presentation === 'rows')
    ? null : garmentSizeMatrix(section))
  const aligned = mixedAudience && matrices[0] && matrices[1] && alignAudienceMatrices(matrices[0], matrices[1])
  if (aligned) [matrices[0], matrices[1]] = aligned
  const useMatrix = matrices.every(matrix => matrix !== null)
  const width = useMatrix ? Math.max(...matrices.map(matrix => matrix.columnCount)) : 2
  const allGroups = sections.flatMap(section => section.groups)
  const totalsByColour = aligned && sections.length === 2 && aligned[0].designs.flatMap((design, i) =>
    design.colours.map(({cells}, j) => count([...cells.values(), ...aligned[1].designs[i].colours[j].cells.values()])))
  return <div className="rc-tables rc-combined-garments">
    <table><caption>服装数量明细（件）</caption>
      {sections.map((section, index) => useMatrix
        ? <MatrixRows key={section.label} section={section} matrix={matrices[index]!} width={width}/>
        : <DetailRows key={section.label} section={section}/>)}
      <tbody><tr className="rc-total"><th scope="row" colSpan={totalsByColour ? 1 : width + 1}>整单合计</th>
        {totalsByColour && totalsByColour.map((total, index) => <td key={index}>{total}</td>)}
        <td>{groupCount(allGroups.map(({group}) => group))}</td></tr></tbody>
    </table>
    <dl className="rc-garment-legend">{allGroups.map(({group, index, label}) =>
      <div key={index}><dt>{label}</dt>
        {group.pricingKind && group.pricingKind !== 'unlinked' && <dd>{garments[group.pricingKind]}</dd>}
        {group.prints?.length ? <dd>印花　{printRequirements(group, catalogue)}</dd> :
          group.pricingKind !== 'unlinked' && <dd>{group.prints ? garmentOnlyLabel : '印花规格待核'}</dd>}
        {group.notes && <dd className="rc-group-note">{group.notes}</dd>}
      </div>)}</dl>
  </div>
}

export function GarmentTables({layout}: {layout?: PrintLayout | null}) {
  if (!layout?.groups.length) return null
  const sections = garmentSections(layout)
  if (sections) return <CombinedGarmentTable sections={sections}/>
  return <div className="rc-tables">{layout.groups.map((group, i) => {
    const columns = matrixColumns(group)
    const colours = [...new Set(group.rows.map(r => r.colour))]
    const showColour = colours.some(c => c.trim())
    const total = totalPieces(group.rows)
    const columnCount = (showColour ? 1 : 0) + (columns ? columns.length + 1 : 2)
    return <section key={i}><table>
      <caption>{group.heading}</caption>
      <thead><tr>{showColour && <th scope="col">衣服颜色</th>}
        {columns ? columns.map(s => <th key={s} scope="col">{s}</th>) : <th scope="col">尺码</th>}
        <th scope="col">{columns ? '小计（件）' : '数量（件）'}</th></tr></thead>
      <tbody>{columns ? colours.map(c => {
        const matching = group.rows.filter(r => r.colour === c)
        return <tr key={c}>{showColour && <th scope="row">{c || '未注明'}</th>}
          {columns.map(s => {
            const row = matching.find(r => r.size === s)
            return <td key={s}>{row ? row.quantity ?? '待核' : '—'}</td>
          })}<td>{totalPieces(matching) ?? '待核'}</td></tr>
      }) : group.rows.map((r, j) => <tr key={j}>
        {showColour && <td>{r.colour || '未注明'}</td>}<td>{r.size || '未注明'}</td><td>{r.quantity ?? '待核'}</td></tr>)}
      <tr className="rc-total"><th scope="row" colSpan={columnCount - 1}>合计</th><td>{total === null ? '待核' : total + ' 件'}</td></tr>
      </tbody></table>
      {group.notes && <p className="rc-group-note">{group.notes}</p>}
    </section>
  })}</div>
}
