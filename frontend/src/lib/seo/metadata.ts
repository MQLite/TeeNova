/**
 * Metadata construction (Jira 10308 Phases 2, 4, 5, 6, 7, 24).
 *
 * Every public route builds its `Metadata` object through {@link buildPageMetadata}, so the
 * canonical rule, the Open Graph shape, the robots decision and the brand suffix are decided once
 * rather than copied into eleven route files with small variations. Before this task five route
 * files carried their own hand-written `openGraph` block and the brand name as a literal; two of
 * those blocks disagreed about the `siteName`.
 *
 * ## Canonicals
 *
 * A canonical is absolute or absent. When the production origin is unavailable (see `site-url.ts`)
 * `alternates` is omitted entirely rather than falling back to a relative value — a relative
 * canonical with no `metadataBase` resolves against whatever host served the response, which is
 * exactly the "silently generate a localhost canonical" failure this task must prevent.
 *
 * Query strings never reach a canonical. `/products?search=tee&category=badges`,
 * `/quote?service=signage&source=/services/signage` and any unknown parameter all canonicalize to
 * their bare route, because none of those states is a distinct approved page. The parameters keep
 * working — this is metadata normalization, not a functional change.
 */

import type { Metadata } from 'next'
import {
  defaultDescription,
  defaultSocialImage,
  defaultTitle,
  openGraphSiteName,
  siteLocale,
  socialTitle,
} from './identity'
import { robotsDirective, type IndexPolicy } from './indexability'
import { absoluteUrl, siteOrigin } from './site-url'

/** `metadataBase` for the root layout, or undefined when no approved origin is configured. */
export function metadataBase(): URL | undefined {
  const origin = siteOrigin()
  if (!origin) return undefined
  try {
    return new URL(origin)
  } catch {
    return undefined
  }
}

/**
 * Absolute canonical for a route path, or `null` when the site origin is unavailable.
 *
 * The path is taken as given and stripped of query and fragment; callers pass the *canonical*
 * path, which for a filtered listing is the bare route rather than the URL that was requested.
 */
export const canonicalUrl = (path: string): string | null => absoluteUrl(path)

export interface SocialImage {
  /** Absolute URL, or a site-relative path resolved against the site origin. */
  url: string
  /** Required: a social card without alt text is unreadable to anyone using a screen reader. */
  alt: string
  width?: number
  height?: number
}

export interface PageMetadataInput {
  /** Route title. The root layout appends the brand suffix via the title template. */
  title: string
  /**
   * Use the title verbatim instead of running it through the layout's `%s | Brand` template. Only
   * the homepage sets this — its title already ends in the brand name, and templating it would
   * produce "Otahuhu Printing Shop | Custom Printing Auckland | Otahuhu Printing".
   */
  absoluteTitle?: boolean
  description: string
  /** Canonical path, e.g. `/services/pvc-banners`. Query strings are stripped. */
  path: string
  policy: IndexPolicy
  /** Defaults to `website`. */
  ogType?: 'website' | 'article'
  /** Shorter description for social cards, where long text is truncated anyway. */
  socialDescription?: string
  /** Page-specific card image. Omit to use the site default (`identity.defaultSocialImage`). */
  images?: SocialImage[]
}

/**
 * Resolve social images to absolute URLs, falling back to the site default card.
 *
 * Every indexable page gets a card: a page-specific one where a public product or portfolio image
 * exists, and the neutral default otherwise. The result is `undefined` only when the site origin is
 * unavailable, in which case the alternative would be a relative `og:image` that resolves against
 * whatever host answered — the same failure mode the canonical rules exist to prevent.
 */
function resolveImages(images: SocialImage[] | undefined): SocialImage[] | undefined {
  const candidates = images && images.length > 0 ? images : [{ ...defaultSocialImage }]
  const resolved = candidates
    .map((image) => {
      if (/^https?:\/\//i.test(image.url)) return image
      const absolute = absoluteUrl(image.url)
      return absolute ? { ...image, url: absolute } : null
    })
    .filter((image): image is SocialImage => image !== null)
  return resolved.length > 0 ? resolved : undefined
}

/**
 * Build a route's metadata.
 *
 * Twitter/X metadata declares only the card type. No `site`/`creator` handle is emitted: no handle
 * has been verified (Jira 10300 has no approval for one), and an unverified handle attributes the
 * page to an account that may belong to somebody else.
 */
export function buildPageMetadata(input: PageMetadataInput): Metadata {
  const canonical = canonicalUrl(input.path)
  const images = resolveImages(input.images)
  const socialDescription = input.socialDescription ?? input.description

  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description: input.description,
    ...(canonical ? { alternates: { canonical } } : {}),
    robots: robotsDirective(input.policy),
    openGraph: {
      title: socialTitle(input.title),
      description: socialDescription,
      type: input.ogType ?? 'website',
      locale: siteLocale,
      siteName: openGraphSiteName,
      ...(canonical ? { url: canonical } : {}),
      ...(images ? { images } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle(input.title),
      description: socialDescription,
      ...(images ? { images } : {}),
    },
  }
}

/**
 * Metadata for a route that must not be indexed and has nothing to say socially — the cart,
 * checkout and order pages. No canonical, no Open Graph: publishing a social card for a page that
 * shows one visitor's basket is meaningless.
 */
export function transactionalMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
    robots: robotsDirective('noindex-nofollow'),
  }
}

/** Site defaults, re-exported so the root layout does not import from two modules. */
export { defaultTitle, defaultDescription }
