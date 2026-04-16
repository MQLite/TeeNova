'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { catalogApi } from '@/api/catalog'

interface Props {
  productId: string
  isActive: boolean
}

export function ProductStatusToggle({ productId, isActive }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function toggle() {
    setLoading(true)
    try {
      await catalogApi.updateProductStatus(productId, !isActive)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className={[
        'mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.54px] transition-colors',
        isActive
          ? 'border border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
          : 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
        loading ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
    >
      {loading ? (
        <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 100 8v4a8 8 0 01-8-8z" />
        </svg>
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-amber-500'}`} />
      )}
      {isActive ? 'Active — click to deactivate' : 'Inactive — click to activate'}
    </button>
  )
}
