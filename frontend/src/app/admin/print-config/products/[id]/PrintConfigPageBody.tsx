'use client'

import { useEffect, useState } from 'react'
import { PrintConfigPanel } from '@/components/admin/products/PrintConfigPanel'
import type { Product } from '@/types'

interface Props {
  product: Product
}

export function PrintConfigPageBody({ product }: Props) {
  const [currentProduct, setCurrentProduct] = useState(product)

  useEffect(() => {
    setCurrentProduct(product)
  }, [product])

  return (
    <PrintConfigPanel
      product={currentProduct}
      onProductUpdated={setCurrentProduct}
    />
  )
}
