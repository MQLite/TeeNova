'use client'

import { useEffect, useMemo, useState } from 'react'
import { makeCatalogApi } from '@/api/catalog'
import { makePrintConfigApi } from '@/api/print-config'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import type { PrintArea, ProductPrintConfigOption } from '@/types'

const catalogApi = makeCatalogApi(adminApiClient)
const printConfigApi = makePrintConfigApi(adminApiClient)

const PRODUCT_DEFAULT = '__product__'

interface Props {
  productId: string
  variantSizes: string[]
}

interface MatrixColumn {
  key: string
  printAreaId: string
  printAreaName: string
  printAreaCode: string
  printSizeId: string
  printSizeName: string
  printSizeCode: string
  areaSortOrder: number
  optionSortOrder: number
  sizeSortOrder: number
}

interface MatrixRow {
  key: string
  label: string
  description: string
  size: string | null
}

function cellKey(rowKey: string, columnKey: string): string {
  return `${rowKey}|${columnKey}`
}

function optionKey(option: ProductPrintConfigOption): string {
  return `${option.size ?? PRODUCT_DEFAULT}|${option.printAreaId}|${option.printSizeId}`
}

function columnKey(printAreaId: string, printSizeId: string): string {
  return `${printAreaId}|${printSizeId}`
}

function sortAreas(areas: PrintArea[]): PrintArea[] {
  return [...areas].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

export function PrintOptionsMatrix({ productId, variantSizes }: Props) {
  const [columns, setColumns] = useState<MatrixColumn[]>([])
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const rows = useMemo<MatrixRow[]>(
    () => [
      {
        key: PRODUCT_DEFAULT,
        label: 'Product default',
        description: 'Applies unless a size has selected override options.',
        size: null,
      },
      ...variantSizes.map((size) => ({
        key: size,
        label: `Size override: ${size}`,
        description: 'Leave empty to fall back to Product default.',
        size,
      })),
    ],
    [variantSizes],
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      setSaveError(null)
      setSaveSuccess(false)

      try {
        const [areas, options] = await Promise.all([
          printConfigApi.getAreas(),
          catalogApi.getProductPrintConfigOptions(productId),
        ])

        const sortedAreas = sortAreas(areas)
        const areaOptions = await Promise.all(
          sortedAreas.map(async (area) => ({
            area,
            options: await printConfigApi.getAreaSizes(area.id, false),
          })),
        )

        if (cancelled) return

        const nextColumns = areaOptions
          .flatMap(({ area, options: opts }) =>
            opts.map((option) => ({
              key: columnKey(area.id, option.printSizeId),
              printAreaId: area.id,
              printAreaName: area.name,
              printAreaCode: area.code,
              printSizeId: option.printSizeId,
              printSizeName: option.printSize.name,
              printSizeCode: option.printSize.code,
              areaSortOrder: area.sortOrder,
              optionSortOrder: option.sortOrder,
              sizeSortOrder: option.printSize.sortOrder,
            })),
          )
          .sort(
            (a, b) =>
              a.areaSortOrder - b.areaSortOrder ||
              a.printAreaName.localeCompare(b.printAreaName) ||
              a.optionSortOrder - b.optionSortOrder ||
              a.sizeSortOrder - b.sizeSortOrder ||
              a.printSizeName.localeCompare(b.printSizeName),
          )

        setColumns(nextColumns)
        setCheckedKeys(new Set(options.filter((option) => option.isActive).map(optionKey)))
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          redirectToLogin('session-expired')
          return
        }
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load print options matrix.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [productId])

  const hasAnyChecked = useMemo(
    () => rows.some((row) => columns.some((col) => checkedKeys.has(cellKey(row.key, col.key)))),
    [rows, columns, checkedKeys],
  )

  function toggleCell(rowKey: string, col: MatrixColumn) {
    const key = cellKey(rowKey, col.key)
    setSaveSuccess(false)
    setSaveError(null)
    setCheckedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    const options = rows.flatMap((row, rowIndex) =>
      columns.flatMap((col, colIndex) => {
        if (!checkedKeys.has(cellKey(row.key, col.key))) return []
        return [{
          size: row.size,
          printAreaId: col.printAreaId,
          printSizeId: col.printSizeId,
          isActive: true,
          sortOrder: rowIndex * columns.length + colIndex,
        }]
      }),
    )

    try {
      const updated = await catalogApi.setProductPrintConfigOptions(productId, { options })
      setCheckedKeys(new Set(updated.filter((option) => option.isActive).map(optionKey)))
      setSaveSuccess(true)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin('session-expired')
        return
      }
      setSaveError(err instanceof Error ? err.message : 'Could not save print options matrix.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
          Print Options Matrix
        </p>
        <h3 className="mt-1 text-base text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
          Customer-selectable print options
        </h3>
        <div className="mt-3 space-y-1.5 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 text-sm leading-6 text-black/60">
          <p>Print options control what customers can select.</p>
          <p>Product default applies unless a garment size has selected override options.</p>
          <p>Print prices are configured separately.</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-black/[0.06] px-4 py-6 text-center text-sm text-black/45">
          Loading...
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : columns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/[0.12] px-4 py-6 text-center text-sm text-black/55">
          Configure global print area/size options before setting product-specific print options.
        </div>
      ) : (
        <>
          {!hasAnyChecked && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No product-specific print options are selected. This product will use the global print area/size matrix.
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-black/[0.08]">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-black/[0.02]">
                  <th className="sticky left-0 z-10 w-48 min-w-48 border-r border-black/[0.06] bg-black/[0.02] px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                    Scope
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="min-w-[130px] px-3 py-2 text-left align-bottom"
                    >
                      <span className="block text-xs text-black" style={{ fontWeight: 540, letterSpacing: '-0.14px' }}>
                        {col.printAreaName} - {col.printSizeName}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/35">
                        {col.printAreaCode} / {col.printSizeCode}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t border-black/[0.06]">
                    <td className="sticky left-0 z-10 border-r border-black/[0.06] bg-white px-3 py-3">
                      <span className="block text-sm text-black" style={{ fontWeight: 540, letterSpacing: '-0.14px' }}>
                        {row.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-black/45" style={{ letterSpacing: '-0.14px' }}>
                        {row.description}
                      </span>
                    </td>
                    {columns.map((col) => {
                      const key = cellKey(row.key, col.key)
                      const checked = checkedKeys.has(key)
                      return (
                        <td key={col.key} className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={saving}
                            onChange={() => toggleCell(row.key, col)}
                            aria-label={`${row.label}: ${col.printAreaName} - ${col.printSizeName}`}
                            className="h-4 w-4 cursor-pointer accent-black disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs leading-5 text-black/45" style={{ letterSpacing: '-0.14px' }}>
            Empty size override rows fall back to Product default. The current backend cannot represent an explicit zero-option size override.
          </p>

          {saveError && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {saveError}
            </p>
          )}
          {saveSuccess && !saveError && (
            <p className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {!hasAnyChecked
                ? 'Product-specific options cleared. This product now uses the global matrix.'
                : 'Print options matrix saved.'}
            </p>
          )}

          <div className="flex items-center gap-3 border-t border-black/[0.06] pt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm text-white transition-opacity hover:opacity-85 disabled:opacity-40"
              style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
            >
              {saving ? 'Saving...' : 'Save Print Options Matrix'}
            </button>
            <p className="text-xs text-black/40" style={{ letterSpacing: '-0.14px' }}>
              Saved separately from print prices, product fields, variants, and inventory.
            </p>
          </div>
        </>
      )}
    </section>
  )
}
