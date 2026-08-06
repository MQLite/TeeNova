/**
 * Portfolio structured data (Jira 10308 Phase 14).
 *
 * `CreativeWork` is the simplest accurate type. `VisualArtwork` would overstate what these are —
 * they are photographs of printed jobs, not artworks in their own right — and a bare `ImageObject`
 * would describe the photograph rather than the piece of work the page is about. The images are
 * attached as `ImageObject` children, which is where their dimensions and alt text belong.
 *
 * Deliberately absent, and not configurable:
 *
 *   • the customer's name or organisation — publishing who a job was for is a separate permission
 *     from publishing the photograph, and no such approval exists;
 *   • `permissionSource` / `permissionReference` — internal permission bookkeeping, never public;
 *   • `originalFileName` and the storage object key — internal paths;
 *   • rating, endorsement, award, `copyrightHolder` — no approved source.
 *
 * The anonymous portfolio API already returns Published items only (Jira 10302), and the route
 * 404s when the feature is off, so this builder is reached only for content that is publicly
 * visible. `datePublished` uses the item's real `publishedAt` and is omitted when absent — never
 * substituted with the build time.
 */

import type { PortfolioItem } from '@/api/portfolio'
import { resolveImageUrl } from '@/lib/image-utils'
import { absoluteUrl } from '../site-url'
import { creativeWorkId } from './ids'
import {
  compact,
  optionalList,
  optionalText,
  type CreativeWorkNode,
  type ImageObjectNode,
} from './types'

export const portfolioPath = (slug: string): string => `/portfolio/${slug}`

/** `PascalCase` service classification → the spaced label the page renders. */
export const serviceLabel = (serviceType: string): string =>
  serviceType.replace(/([a-z])([A-Z])/g, '$1 $2')

function imageNodes(item: PortfolioItem): ImageObjectNode[] {
  return item.images
    .map((image) => {
      const url = resolveImageUrl(image.url)
      if (!url || !/^https?:\/\//i.test(url)) return null
      return compact<ImageObjectNode>({
        '@type': 'ImageObject',
        url,
        width: Number.isFinite(image.width) && image.width > 0 ? image.width : undefined,
        height: Number.isFinite(image.height) && image.height > 0 ? image.height : undefined,
        // The stored alt text, which the schema requires on every image and the page already
        // renders. No filename, no object key, no permission reference.
        caption: optionalText(image.altText),
      })
    })
    .filter((node): node is ImageObjectNode => node !== null)
}

/** ISO date portion of a recorded publication timestamp, or undefined when there is none. */
function publishedDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed.toISOString()
}

export function buildPortfolioWork(
  item: PortfolioItem,
  options: { indexable: boolean },
): CreativeWorkNode | null {
  if (!options.indexable) return null
  // Belt-and-braces: the API filters to Published, and so does this.
  if (item.status !== 'Published') return null

  const path = portfolioPath(item.slug)
  const id = creativeWorkId(path)
  const url = absoluteUrl(path)
  if (!id || !url) return null

  const name = optionalText(item.title)
  if (!name) return null

  return compact<CreativeWorkNode>({
    '@type': 'CreativeWork',
    '@id': id,
    name,
    url,
    description: optionalText(item.shortCaption),
    image: optionalList(imageNodes(item)),
    datePublished: publishedDate(item.publishedAt),
    about: optionalText(serviceLabel(item.serviceType)),
  })
}
