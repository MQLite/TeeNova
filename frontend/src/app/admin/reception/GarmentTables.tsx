import { matrixColumns, totalPieces, type PrintLayout } from '@/features/reception/worksheet'

export function GarmentTables({layout}: {layout?: PrintLayout | null}) {
  if (!layout?.groups.length) return null
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
