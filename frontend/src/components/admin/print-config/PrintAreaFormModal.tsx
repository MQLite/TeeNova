'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { printConfigApi } from '@/api/print-config'
import type { PrintArea, CreateUpdatePrintAreaInput } from '@/types'

interface FormValues {
  name: string
  code: string
  basePrice: string
  sortOrder: string
  isActive: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  editTarget: PrintArea | null
  onSaved: () => void
}

const FIELD = [
  'w-full rounded-2xl border border-black/[0.10] bg-white px-4 py-3 text-sm text-black',
  'placeholder:text-black/30',
  'focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/[0.06]',
  'disabled:opacity-50',
].join(' ')

const LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55'

function buildValues(target: PrintArea | null): FormValues {
  return {
    name:      target?.name      ?? '',
    code:      target?.code      ?? '',
    basePrice: target != null ? String(target.basePrice) : '0',
    sortOrder: target != null ? String(target.sortOrder) : '0',
    isActive:  target?.isActive  ?? true,
  }
}

export function PrintAreaFormModal({ open, onClose, editTarget, onSaved }: Props) {
  const [values,  setValues]  = useState<FormValues>(() => buildValues(editTarget))
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValues(buildValues(editTarget))
      setError(null)
    }
  }, [open, editTarget])

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const name = values.name.trim()
    const code = values.code.trim()
    if (!name) { setError('Name is required.'); return }
    if (!code) { setError('Code is required.'); return }

    const basePrice = parseFloat(values.basePrice)
    if (isNaN(basePrice) || basePrice < 0) { setError('Base price must be 0 or greater.'); return }

    const sortOrder = parseInt(values.sortOrder, 10)
    if (isNaN(sortOrder)) { setError('Sort order must be a whole number.'); return }

    const input: CreateUpdatePrintAreaInput = {
      name,
      code,
      basePrice,
      isActive: values.isActive,
      sortOrder,
      legacyPositionValue: editTarget?.legacyPositionValue ?? null,
    }

    setSaving(true)
    try {
      if (editTarget) {
        await printConfigApi.updateArea(editTarget.id, input)
      } else {
        await printConfigApi.createArea(input)
      }
      onSaved()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editTarget ? 'Edit Print Area' : 'Add Print Area'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={LABEL}>Name *</label>
            <input
              type="text"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Front Center"
              className={FIELD}
              disabled={saving}
            />
          </div>

          <div className="col-span-2">
            <label className={LABEL}>Code *</label>
            <input
              type="text"
              value={values.code}
              onChange={(e) => set('code', e.target.value)}
              placeholder="e.g. FRONT_CENTER"
              className={FIELD}
              disabled={saving}
            />
          </div>

          <div>
            <label className={LABEL}>Base Price ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.basePrice}
              onChange={(e) => set('basePrice', e.target.value)}
              className={FIELD}
              disabled={saving}
            />
          </div>

          <div>
            <label className={LABEL}>Sort Order</label>
            <input
              type="number"
              step="1"
              value={values.sortOrder}
              onChange={(e) => set('sortOrder', e.target.value)}
              className={FIELD}
              disabled={saving}
            />
          </div>
        </div>

        {/* IsActive toggle */}
        <div className="flex items-center justify-between rounded-2xl border border-black/[0.08] px-4 py-3">
          <span className={LABEL.replace('mb-1.5 block', '')}>Active</span>
          <button
            type="button"
            role="switch"
            aria-checked={values.isActive}
            disabled={saving}
            onClick={() => set('isActive', !values.isActive)}
            className={[
              'relative h-5 w-9 rounded-full transition-colors disabled:opacity-50',
              values.isActive ? 'bg-black' : 'bg-black/20',
            ].join(' ')}
          >
            <span
              className={[
                'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                values.isActive ? 'left-0.5 translate-x-4' : 'left-0.5',
              ].join(' ')}
            />
          </button>
        </div>

        {/* LegacyPositionValue — read-only display */}
        {editTarget?.legacyPositionValue != null && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-amber-700/70">
              Legacy mapping
            </p>
            <p className="mt-0.5 text-sm text-amber-800">
              PrintPosition enum value: <span className="font-mono">{editTarget.legacyPositionValue}</span>
            </p>
            <p className="mt-0.5 text-xs text-amber-700/60">
              This field maps to the legacy system. Do not change it casually.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="white" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="black" size="sm" loading={saving}>
            {editTarget ? 'Save changes' : 'Add print area'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
