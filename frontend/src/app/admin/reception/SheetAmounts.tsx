'use client'

import { useState } from 'react'
import { formatPaymentAmount } from '@/lib/money'
import type { Worksheet } from '@/features/reception/worksheet'

export type AmountField = 'totalPrice' | 'deposit'
export const displayAmount = (value?: number | null) => value == null ? '未填写' : formatPaymentAmount(value)

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

export function SheetAmounts({sheet, onChange}: {sheet: Worksheet; onChange: (field: AmountField, n: number | null) => void}) {
  return <div className="rc-fields">
    <AmountInput label="总价" value={sheet.totalPrice} change={n => onChange('totalPrice', n)}/>
    <AmountInput label="订金" value={sheet.deposit} change={n => onChange('deposit', n)}/>
  </div>
}
