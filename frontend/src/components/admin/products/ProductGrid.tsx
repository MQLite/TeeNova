import type { ProductListItem } from '@/types'
import { ProductCard } from './ProductCard'

interface ProductGridProps {
  products: ProductListItem[]
}

export function ProductGrid({ products }: ProductGridProps) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
