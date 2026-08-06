import { printConfigApi } from '@/api/print-config'
import { PRINT_CONFIG_REVALIDATE_SECONDS } from '@/lib/catalog-cache'
import type { Product } from '@/types'
import { ProductConfiguratorClient } from './ProductConfiguratorClient'

/**
 * Garment configuration island (Jira 10304).
 *
 * Kept in its own async server component so the *product* fetch in `page.tsx` — and therefore the
 * 404-vs-200 decision for the document — completes before Next.js flushes the response. Only this
 * subtree waits on the two global print-configuration reads, and it does so behind the structural
 * skeleton, so a cache miss on that configuration never delays the product identity or the status
 * line.
 *
 * Badge and Banner detail views take neither print areas nor print sizes, so their routes no longer
 * pay for two requests they never read: this component is not rendered for them at all.
 *
 * A failure here is a *temporary* failure of an existing product: it propagates to the route error
 * boundary (retryable), never to the not-found response.
 */
export async function GarmentConfigurationSection({ product }: { product: Product }) {
  const [printAreas, printSizes] = await Promise.all([
    printConfigApi.getAreas({ revalidate: PRINT_CONFIG_REVALIDATE_SECONDS }),
    printConfigApi.getSizes({ revalidate: PRINT_CONFIG_REVALIDATE_SECONDS }),
  ])

  return (
    <ProductConfiguratorClient key={product.id} product={product} printAreas={printAreas} printSizes={printSizes} />
  )
}
