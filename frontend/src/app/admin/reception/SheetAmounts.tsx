'use client'

import { useState } from 'react'
import { formatPaymentAmount } from '@/lib/money'
import { paymentMethods, type Worksheet, type WorksheetPayment } from '@/features/reception/worksheet'

export const displayAmount = (value?: number | null) => value == null ? '未填写' : formatPaymentAmount(value)
export const displayPayment = (p: WorksheetPayment) => `${p.method || '方式待核'} · ${displayAmount(p.amount)}`

function AmountInput({label, value, change}: {label: string; value?: number | null; change: (n: number | null) => void}) {
  const [typing, setTyping] = useState<string | null>(null)
  return <label>{label}（NZD）<input inputMode="decimal" value={typing ?? value?.toFixed(2) ?? ''}
    placeholder="未填写" onBlur={() => setTyping(null)} onChange={e => {
      const text = e.target.value
      if (!/^\d{0,8}(?:\.\d{0,2})?$/.test(text)) return
      setTyping(text)
      change(text === '' || text === '.' ? null : Number(text))
    }}/></label>
}

export function SheetAmounts({sheet, onChange, estimate}: {sheet: Worksheet;
  onChange: <K extends 'totalPrice' | 'deposit' | 'payments'>(field: K, value: Worksheet[K]) => void;
  estimate: {text: string; retry?: () => void}}) {
  const payments = sheet.payments ?? []
  function revise(index: number, patch: Partial<WorksheetPayment>) {
    onChange('payments', payments.map((payment, i) => i === index ? { ...payment, ...patch } : payment))
  }
  return <div className="rc-fields">
    <div>关联服装预计费用（NZD）<div aria-live="polite">{estimate.text}</div>
      {estimate.retry && <button type="button" onClick={estimate.retry}>刷新估价</button>}
    </div>
    <AmountInput label="总价" value={sheet.totalPrice} change={n => onChange('totalPrice', n)}/>
    <AmountInput label="订金" value={sheet.deposit} change={n => onChange('deposit', n)}/>
    <fieldset className="rc-payments"><legend>实际已付款</legend>
      {payments.map((payment, i) => <div className="rc-payment-row" key={i}>
        <AmountInput label={`第 ${i + 1} 笔实付金额`} value={payment.amount} change={amount => revise(i, {amount})}/>
        <label>第 {i + 1} 笔付款方式<select value={payment.method} onChange={e => revise(i, {method: e.target.value as WorksheetPayment['method']})}>
          <option value="">请选择</option>{paymentMethods.map(method => <option key={method}>{method}</option>)}
        </select></label>
        <button type="button" onClick={() => onChange('payments', payments.filter((_, index) => i !== index))}>移除第 {i + 1} 笔付款</button>
      </div>)}
      {payments.length < 40 && <button type="button" onClick={() => onChange('payments', [...payments, {amount: null, method: ''}])}>添加已付款项</button>}
    </fieldset>
  </div>
}
