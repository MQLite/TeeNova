'use client'

import { useEffect, useMemo, useState } from 'react'
import { makeCatalogApi } from '@/api/catalog'
import { makePrintConfigApi } from '@/api/print-config'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import type { PrintSize, ProductPrintPriceTier } from '@/types'

const catalogApi = makeCatalogApi(adminApiClient)
const printConfigApi = makePrintConfigApi(adminApiClient)

const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/

interface Props {
  printPricingGroupId: string | null
  embedded?: boolean
}

type PriceMatrix = Record<string, Record<string, string>>

function cellKey(printSizeId: string): string {
  return printSizeId
}

function normalizeBreaks(values: string[]): string[] {
  const unique = Array.from(
    new Set(
      values
        .map((v) => v.trim())
        .filter((v) => /^\d+$/.test(v) && parseInt(v, 10) >= 1)
        .map((v) => String(parseInt(v, 10))),
    ),
  )
  return unique.sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
}

function matrixFromTiers(tiers: ProductPrintPriceTier[]): { breaks: string[]; matrix: PriceMatrix } {
  const groupDefaultTiers = tiers.filter((tier) => tier.size == null)
  const breaks = normalizeBreaks(['1', ...groupDefaultTiers.map((tier) => String(tier.minQuantity))])
  const matrix: PriceMatrix = {}

  groupDefaultTiers.forEach((tier) => {
    const key = cellKey(tier.printSizeId)
    matrix[key] = matrix[key] ?? {}
    matrix[key][String(tier.minQuantity)] = tier.isActive ? tier.unitPrintPrice.toFixed(2) : ''
  })

  return { breaks, matrix }
}

export function PrintPricesSection({ printPricingGroupId, embedded = false }: Props) {
  const [printSizes, setPrintSizes] = useState<PrintSize[]>([])
  const [breaks, setBreaks] = useState<string[]>(['1'])
  const [matrix, setMatrix] = useState<PriceMatrix>({})
  const [newBreak, setNewBreak] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false

    setSaveError(null)
    setSaveSuccess(false)
    setLoadError(null)

    if (!printPricingGroupId) {
      setPrintSizes([])
      setBreaks(['1'])
      setMatrix({})
      setLoading(false)
      return () => { cancelled = true }
    }

    setLoading(true)
    Promise.all([
      catalogApi.getPrintPriceTiers(printPricingGroupId),
      printConfigApi.getSizes(),
    ])
      .then(([tiers, sizes]) => {
        if (cancelled) return
        const next = matrixFromTiers(tiers)
        setPrintSizes([...sizes].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)))
        setBreaks(next.breaks)
        setMatrix(next.matrix)
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          redirectToLogin('session-expired')
          return
        }
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load print prices.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [printPricingGroupId])

  const validation = useMemo(() => {
    const cellErrors = new Set<string>()
    const rowErrors: string[] = []
    const warnings: string[] = []
    const normalizedBreaks = normalizeBreaks(breaks)

    if (normalizedBreaks.length !== breaks.length) {
      rowErrors.push('Quantity breaks must be unique whole numbers greater than or equal to 1.')
    }

    printSizes.forEach((printSize) => {
      const key = cellKey(printSize.id)
      const row = matrix[key] ?? {}
      const filled = normalizedBreaks
        .map((min) => ({ min, price: row[min]?.trim() ?? '' }))
        .filter((item) => item.price !== '')

      filled.forEach((item) => {
        if (!PRICE_PATTERN.test(item.price) || parseFloat(item.price) <= 0) {
          cellErrors.add(`${key}|${item.min}`)
        }
      })

      if (filled.length > 0 && !filled.some((item) => item.min === '1')) {
        rowErrors.push(`${printSize.name}: add a price at quantity 1.`)
      }

      const priced = filled
        .filter((item) => PRICE_PATTERN.test(item.price) && parseFloat(item.price) > 0)
        .map((item) => ({ min: parseInt(item.min, 10), price: parseFloat(item.price) }))
        .sort((a, b) => a.min - b.min)

      for (let i = 1; i < priced.length; i++) {
        if (priced[i].price >= priced[i - 1].price) {
          warnings.push(`${printSize.name}: price at ${priced[i].min}+ is not lower than the previous break.`)
          break
        }
      }
    })

    return {
      breaks: normalizedBreaks,
      cellErrors,
      rowErrors,
      warnings,
      hasErrors: cellErrors.size > 0 || rowErrors.length > 0,
    }
  }, [breaks, matrix, printSizes])

  function updatePrice(printSizeId: string, minQuantity: string, value: string) {
    setSaveSuccess(false)
    setSaveError(null)
    const key = cellKey(printSizeId)
    setMatrix((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? {}),
        [minQuantity]: value,
      },
    }))
  }

  function addQuantityBreak() {
    const value = newBreak.trim()
    setSaveSuccess(false)
    setSaveError(null)
    if (!/^\d+$/.test(value) || parseInt(value, 10) < 1) {
      setSaveError('Quantity break must be a whole number greater than or equal to 1.')
      return
    }

    setBreaks((prev) => normalizeBreaks([...prev, value]))
    setNewBreak('')
  }

  function removeQuantityBreak(minQuantity: string) {
    if (minQuantity === '1') {
      setSaveError('Quantity 1 is required for any configured price ladder.')
      return
    }

    setSaveSuccess(false)
    setSaveError(null)
    setBreaks((prev) => prev.filter((value) => value !== minQuantity))
    setMatrix((prev) => {
      const next: PriceMatrix = {}
      Object.entries(prev).forEach(([key, row]) => {
        const { [minQuantity]: _removed, ...rest } = row
        next[key] = rest
      })
      return next
    })
  }

  async function handleSave() {
    if (!printPricingGroupId) return
    setSaveError(null)
    setSaveSuccess(false)

    if (validation.hasErrors) {
      setSaveError('Fix the highlighted issues before saving.')
      return
    }

    const tiers = printSizes.flatMap((printSize, sizeIndex) => {
      const key = cellKey(printSize.id)
      const row = matrix[key] ?? {}
      return validation.breaks.flatMap((minQuantity, breakIndex) => {
        const price = row[minQuantity]?.trim() ?? ''
        if (!price) return []
        return [{
          size: null,
          printSizeId: printSize.id,
          minQuantity: parseInt(minQuantity, 10),
          unitPrintPrice: parseFloat(price),
          isActive: true,
          sortOrder: sizeIndex * validation.breaks.length + breakIndex,
        }]
      })
    },
    )

    setSaving(true)
    try {
      const updated = await catalogApi.setPrintPriceTiers(printPricingGroupId, { tiers })
      const next = matrixFromTiers(updated)
      setBreaks(next.breaks)
      setMatrix(next.matrix)
      setSaveSuccess(true)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin('session-expired')
        return
      }
      setSaveError(err instanceof Error ? err.message : 'Could not save print prices. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={embedded ? 'space-y-4' : 'rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-card'}>
      <div className="mb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Print Prices</p>
        <h3 className="mt-1 text-base text-black" style={{ fontWeight: 540 }}>
          Tier print price matrix
        </h3>
        <div className="mt-3 space-y-1.5 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 text-sm leading-6 text-black/60">
          <p>This sets print price only. The garment/base price is unchanged.</p>
          <p>Rows are print sizes; columns are quantity breaks shared by the pricing group.</p>
          <p>Blank cells are ignored. Any row with prices must include a price at quantity 1.</p>
        </div>
      </div>

      {!printPricingGroupId ? (
        <div className="rounded-2xl border border-dashed border-black/[0.12] px-4 py-6 text-center text-sm text-black/55">
          Assign this product to a print pricing group before configuring print prices.
        </div>
      ) : loading ? (
        <div className="rounded-2xl border border-black/[0.06] px-4 py-6 text-center text-sm text-black/45">Loading...</div>
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>
      ) : printSizes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/[0.12] px-4 py-6 text-center text-sm text-black/55">
          Configure print sizes before setting tier print prices.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 sm:flex-row sm:items-end">
            <div className="w-full max-w-xs">
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
                Add quantity break
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={newBreak}
                disabled={saving}
                onChange={(event) => setNewBreak(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addQuantityBreak()
                  }
                }}
                placeholder="e.g. 25"
                className="w-full rounded-xl border border-black/[0.10] bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/[0.06]"
              />
            </div>
            <button
              type="button"
              onClick={addQuantityBreak}
              disabled={saving}
              className="inline-flex shrink-0 items-center justify-center rounded-full border border-black/[0.12] bg-white px-4 py-2 text-sm text-black/70 transition-colors hover:border-black/30 hover:text-black disabled:opacity-40"
              style={{ fontWeight: 480 }}
            >
              Add Break
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-black/[0.08]">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-black/[0.02]">
                  <th className="sticky left-0 z-20 w-56 min-w-56 border-r border-black/[0.06] bg-black/[0.02] px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                    Print Size
                  </th>
                  {validation.breaks.map((minQuantity) => (
                    <th key={minQuantity} className="min-w-[130px] px-3 py-2 text-left align-bottom">
                      <span className="block text-xs text-black" style={{ fontWeight: 540 }}>
                        Qty {minQuantity}+
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/35">
                        Unit print price
                      </span>
                      {minQuantity !== '1' && (
                        <button
                          type="button"
                          onClick={() => removeQuantityBreak(minQuantity)}
                          disabled={saving}
                          className="mt-1 text-[11px] text-red-600 transition-opacity hover:opacity-70 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {printSizes.map((printSize) => {
                  const key = cellKey(printSize.id)
                  return (
                    <tr key={key} className="border-t border-black/[0.06]">
                      <td className="sticky left-0 z-10 border-r border-black/[0.06] bg-white px-3 py-3">
                        <span className="block text-sm text-black" style={{ fontWeight: 540 }}>
                          {printSize.name}
                        </span>
                        <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/35">
                          {printSize.code}
                        </span>
                      </td>
                      {validation.breaks.map((minQuantity) => {
                        const errorKey = `${key}|${minQuantity}`
                        const hasError = validation.cellErrors.has(errorKey)
                        return (
                          <td key={minQuantity} className="px-3 py-2">
                            <div className="relative">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-black/40">$</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={matrix[key]?.[minQuantity] ?? ''}
                                disabled={saving}
                                onChange={(event) => updatePrice(printSize.id, minQuantity, event.target.value)}
                                aria-label={`${printSize.name} quantity ${minQuantity} price`}
                                className={[
                                  'w-full rounded-xl border bg-white py-2 pl-7 pr-3 text-sm text-black placeholder:text-black/30 focus:outline-none focus:ring-2',
                                  hasError
                                    ? 'border-red-300 focus:border-red-300 focus:ring-red-100'
                                    : 'border-black/[0.10] focus:border-black/30 focus:ring-black/[0.06]',
                                ].join(' ')}
                                placeholder="0.00"
                              />
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {validation.rowErrors.length > 0 && (
            <ul className="space-y-1 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {validation.rowErrors.map((error, index) => <li key={index}>{error}</li>)}
            </ul>
          )}
          {validation.cellErrors.size > 0 && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Prices must be greater than 0 with up to 2 decimals.
            </p>
          )}
          {validation.warnings.length > 0 && (
            <ul className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {validation.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
            </ul>
          )}
          {saveError && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</p>
          )}
          {saveSuccess && !saveError && (
            <p className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              Print price matrix saved.
            </p>
          )}

          <div className="flex items-center gap-3 border-t border-black/[0.06] pt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || validation.hasErrors}
              className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm text-white transition-opacity hover:opacity-85 disabled:opacity-40"
              style={{ fontWeight: 480 }}
            >
              {saving ? 'Saving...' : 'Save Print Price Matrix'}
            </button>
            <p className="text-xs text-black/40">
              Saved per pricing group, separately from product fields, variants, inventory, and print options.
            </p>
          </div>
        </>
      )}
    </section>
  )
}
