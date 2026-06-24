'use client'

import { useEffect, useState } from 'react'
import { makeCatalogApi } from '@/api/catalog'
import { adminApiClient } from '@/lib/admin-client'
import type { PrintPricingGroup } from '@/types'

const catalogApi = makeCatalogApi(adminApiClient)

interface Props {
  /** Selected group id, or '' for no group. */
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

const FIELD_BASE = [
  'w-full rounded-2xl border border-black/[0.10] bg-white px-4 py-3 text-sm text-black',
  'placeholder:text-black/30',
  'focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/[0.06]',
  'disabled:opacity-50',
].join(' ')

const LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55'

/** Derives a stable uppercase code from a group name, e.g. "T-shirt printing" → "T_SHIRT_PRINTING". */
function deriveCode(name: string): string {
  const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64)
  return code || `GROUP_${Date.now()}`
}

/**
 * Print-pricing group selector with inline create. Loads groups once; lets staff pick a group, clear
 * it, or create a new one. The selected id is owned by the parent form and saved through the normal
 * product update (Product.PrintPricingGroupId), so it never clobbers tiers/options/variants.
 */
export function PrintPricingGroupField({ value, onChange, disabled }: Props) {
  const [groups, setGroups] = useState<PrintPricingGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    catalogApi
      .listPrintPricingGroups()
      .then((g) => { if (!cancelled) setGroups(g) })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load print pricing groups.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Offer active groups plus the currently-assigned one (even if it was later deactivated).
  const options = groups.filter((g) => g.isActive || g.id === value)

  async function handleCreate() {
    const name = newName.trim()
    if (!name) { setCreateError('Group name is required.'); return }
    setCreating(true)
    setCreateError(null)
    try {
      const created = await catalogApi.createPrintPricingGroup({
        name,
        code: deriveCode(name),
        isActive: true,
        sortOrder: groups.length,
      })
      setGroups((prev) => [...prev, created])
      onChange(created.id)
      setShowCreate(false)
      setNewName('')
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Could not create group.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <label className={LABEL}>Print Pricing Group</label>

      <div className="flex items-center gap-2">
        <select
          value={value}
          disabled={disabled || loading}
          onChange={(e) => onChange(e.target.value)}
          className={FIELD_BASE}
        >
          <option value="">No group (ungrouped)</option>
          {options.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}{!g.isActive ? ' (inactive)' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled}
          onClick={() => { setShowCreate((s) => !s); setCreateError(null) }}
          className="shrink-0 rounded-2xl border border-black/[0.12] bg-white px-3 py-3 text-sm text-black/70 transition-colors hover:border-black/30 hover:text-black disabled:opacity-40"
          style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
        >
          {showCreate ? 'Close' : '+ New'}
        </button>
      </div>

      {showCreate && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={newName}
            disabled={creating}
            placeholder="New group name, e.g. T-shirt printing"
            maxLength={128}
            onChange={(e) => setNewName(e.target.value)}
            className={FIELD_BASE}
          />
          <button
            type="button"
            disabled={creating}
            onClick={handleCreate}
            className="shrink-0 rounded-2xl bg-black px-4 py-3 text-sm text-white transition-opacity hover:opacity-85 disabled:opacity-40"
            style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}

      {createError && (
        <p className="mt-1.5 text-xs text-red-600" style={{ letterSpacing: '-0.14px' }}>{createError}</p>
      )}
      {loadError && (
        <p className="mt-1.5 text-xs text-red-600" style={{ letterSpacing: '-0.14px' }}>{loadError}</p>
      )}

      <p className="mt-2 text-xs leading-5 text-black/45" style={{ letterSpacing: '-0.14px' }}>
        Products in the same print pricing group share quantity breaks for print pricing. Garment price
        remains fixed — the group only controls print price tiers.
      </p>
    </div>
  )
}
