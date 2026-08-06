/**
 * `BreadcrumbList` (Jira 10308 Phase 10).
 *
 * One builder, used by every route that visibly renders a breadcrumb trail. The structured trail
 * must be the trail the visitor can see — search-engine guidance treats a breadcrumb that does not
 * appear on the page as markup that does not describe the page — so each caller passes the same
 * array it renders, and the parity is asserted in tests by reading the rendered DOM.
 *
 * Rules enforced here rather than at each call site: positions start at 1 and are contiguous, every
 * item URL is absolute, query strings are stripped, and the final item (the current page) carries no
 * `item` link because it is the page being viewed.
 */

import { absoluteUrl } from '../site-url'
import { breadcrumbId } from './ids'
import { compact, optionalText, type BreadcrumbItemNode, type BreadcrumbListNode } from './types'

export interface BreadcrumbTrailItem {
  name: string
  /**
   * Site-relative path.
   *
   * Omitted for the current page, and also for a crumb that is genuinely not a link on the page —
   * the "Help" and "Policies" labels in the content breadcrumb are plain text because no
   * `/help` or `/policies` index route exists. Such a crumb is emitted as a `ListItem` with a name
   * and position and no `item`, which is what the visitor sees.
   */
  path?: string
}

/**
 * Build the node, or return `null` when it would be meaningless.
 *
 * Returns null for a trail shorter than two items (a one-item breadcrumb describes nothing) and
 * when no site origin is available, because the URLs would have to be relative.
 */
export function buildBreadcrumbList(
  currentPath: string,
  trail: readonly BreadcrumbTrailItem[],
): BreadcrumbListNode | null {
  if (trail.length < 2) return null
  const id = breadcrumbId(currentPath)
  if (!id) return null

  const items: BreadcrumbItemNode[] = []
  for (const [index, entry] of trail.entries()) {
    const name = optionalText(entry.name)
    if (!name) return null
    const isLast = index === trail.length - 1
    const item = (!isLast && entry.path ? absoluteUrl(entry.path) : undefined) ?? undefined
    // A crumb that claims to be a link but resolves to nothing would produce an incomplete list;
    // drop the whole node rather than emit half a trail. A crumb with no `path` at all is the
    // deliberate unlinked case and keeps its name only.
    if (!isLast && entry.path && !item) return null
    items.push(compact<BreadcrumbItemNode>({ '@type': 'ListItem', position: index + 1, name, item }))
  }

  return { '@type': 'BreadcrumbList', '@id': id, itemListElement: items }
}
