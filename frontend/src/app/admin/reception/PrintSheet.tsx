'use client'

import { createPortal } from 'react-dom'
import type { Worksheet } from '@/features/reception/worksheet'
import { GarmentTables } from './GarmentTables'
import { displayAmount } from './SheetAmounts'

export function PrintSheet({ sheet, received, id, estimate }: { sheet: Worksheet; received: string; id?: string; estimate: string }) {
  return createPortal(<article className="reception-print" lang="zh-CN">
    <header><p>TeeNova · Otahuhu Printing</p><h1>{sheet.layout?.title || '接待工作单'}</h1>
      <p>{id && '工作单 ' + id + ' · '}门店自取</p></header>
    <dl>{[['接单日期', received], ['预计可取日期', sheet.pickupDate || '待定'],
      ['客户', sheet.customer || '—'], ['联系电话', sheet.phone || '—'],
      ['关联服装预计费用', estimate], ['总价', displayAmount(sheet.totalPrice)], ['订金', displayAmount(sheet.deposit)]].map(([key, value]) =>
        <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
    <GarmentTables layout={sheet.layout}/>
    {sheet.instructions && <><h2>制作说明</h2><div className="print-instructions">{sheet.instructions}</div></>}
  </article>, document.body)
}
