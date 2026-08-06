/**
 * Stable `@id` values (Jira 10308 Phase 26).
 *
 * An `@id` is how a consumer knows that the `Organization` referenced from a `Service` on one page
 * is the same entity as the one described on the homepage. They therefore have to be stable across
 * pages and across deployments, and they have to be absolute.
 *
 * The convention is `<origin><path>#<node>`: derived from the one approved site origin, unique per
 * node type per page, and containing nothing that is not already public.
 */

import { absoluteUrl } from '../site-url'

const withFragment = (path: string, fragment: string): string | null => {
  const base = absoluteUrl(path)
  return base ? `${base}#${fragment}` : null
}

/** The business entity. Homepage-anchored so every page refers to the same node. */
export const organizationId = (): string | null => withFragment('/', 'organization')

/** The website itself, distinct from the organization that runs it. */
export const websiteId = (): string | null => withFragment('/', 'website')

export const breadcrumbId = (path: string): string | null => withFragment(path, 'breadcrumb')
export const faqId = (path: string): string | null => withFragment(path, 'faq')
export const serviceId = (path: string): string | null => withFragment(path, 'service')
export const productId = (path: string): string | null => withFragment(path, 'product')
export const creativeWorkId = (path: string): string | null => withFragment(path, 'work')
