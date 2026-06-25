'use client'

import { useEffect, useState } from 'react'
import { makeCatalogApi } from '@/api/catalog'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import { Button } from '@/components/ui/Button'
import { PrintPricingGroupField } from './PrintPricingGroupField'
import type { Product } from '@/types'

const catalogApi = makeCatalogApi(adminApiClient)

interface Props {
  product: Product
  onSaved: (product: Product) => void
}

export function ProductPrintPricingGroupAssignment({ product, onSaved }: Props) {
  const [selectedGroupId, setSelectedGroupId] = useState(product.printPricingGroupId ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    setSelectedGroupId(product.printPricingGroupId ?? '')
  }, [product.printPricingGroupId])

  const isDirty = selectedGroupId !== (product.printPricingGroupId ?? '')

  async function handleSave() {
    if (!isDirty || saving) return

    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const updated = await catalogApi.updateProduct(product.id, {
        name: product.name,
        description: product.description,
        basePrice: product.basePrice,
        productType: product.productType,
        isActive: product.isActive,
        printPricingGroupId: selectedGroupId || null,
      })
      onSaved(updated)
      setSelectedGroupId(updated.printPricingGroupId ?? '')
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin('session-expired')
        return
      }
      setSaveError(err instanceof Error ? err.message : 'Could not save print pricing group.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">
          Print Pricing Group
        </p>
        <h3 className="mt-1 text-base text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
          Quantity break group
        </h3>
        <p className="mt-1 text-sm leading-6 text-black/55" style={{ letterSpacing: '-0.14px' }}>
          Products in the same print pricing group share print quantity breaks. This does not change garment price.
        </p>
      </div>

      <PrintPricingGroupField
        value={selectedGroupId}
        onChange={(value) => {
          setSelectedGroupId(value)
          setSaveSuccess(false)
          setSaveError(null)
        }}
        disabled={saving}
      />

      <div className="flex flex-wrap items-center gap-3 border-t border-black/[0.06] pt-3">
        <Button
          type="button"
          size="sm"
          disabled={!isDirty}
          loading={saving}
          onClick={handleSave}
        >
          Save Group
        </Button>
        {isDirty && !saving && (
          <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-amber-600">
            Unsaved group change
          </span>
        )}
        {saveSuccess && !saveError && (
          <span className="text-sm text-green-700" style={{ letterSpacing: '-0.14px' }}>
            Print pricing group saved.
          </span>
        )}
        {saveError && (
          <span className="text-sm text-red-700" style={{ letterSpacing: '-0.14px' }}>
            {saveError}
          </span>
        )}
      </div>
    </div>
  )
}
