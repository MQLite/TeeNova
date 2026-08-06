/**
 * Typed schema.org node shapes (Jira 10308 Phase 26).
 *
 * Structured data is built from typed objects and serialized once, by one component. No builder in
 * this directory concatenates a JSON string, and none of them accepts pre-rendered markup, so an
 * apostrophe in a product name or a `</script>` in a description is a data problem for the
 * serializer rather than a markup problem for the browser.
 *
 * Every optional property is `?:` and is *omitted* when the underlying fact is unavailable. It is
 * never `null` and never `''`. An empty string in structured data is a positive claim that the
 * value is empty, which is a different and worse statement than saying nothing.
 */

export interface SchemaNodeBase {
  '@type': string
  '@id'?: string
}

export interface PostalAddressNode extends SchemaNodeBase {
  '@type': 'PostalAddress'
  streetAddress: string
  addressLocality: string
  addressRegion: string
  postalCode: string
  addressCountry: string
}

export interface OpeningHoursSpecificationNode extends SchemaNodeBase {
  '@type': 'OpeningHoursSpecification'
  dayOfWeek: string[]
  opens: string
  closes: string
}

export interface ImageObjectNode extends SchemaNodeBase {
  '@type': 'ImageObject'
  url: string
  contentUrl?: string
  width?: number
  height?: number
  caption?: string
}

export interface OrganizationNode extends SchemaNodeBase {
  '@type': 'Organization'
  name: string
  url: string
  legalName?: string
  email?: string
  telephone?: string
  logo?: string
  sameAs?: string[]
}

export interface LocalBusinessNode extends SchemaNodeBase {
  '@type': 'LocalBusiness'
  name: string
  url: string
  legalName?: string
  email?: string
  telephone?: string
  logo?: string
  image?: string[]
  address?: PostalAddressNode
  openingHoursSpecification?: OpeningHoursSpecificationNode[]
  areaServed?: string[]
  priceRange?: string
  sameAs?: string[]
}

export interface WebSiteNode extends SchemaNodeBase {
  '@type': 'WebSite'
  name: string
  url: string
  inLanguage?: string
  publisher?: { '@id': string }
}

export interface BreadcrumbItemNode extends SchemaNodeBase {
  '@type': 'ListItem'
  position: number
  name: string
  item?: string
}

export interface BreadcrumbListNode extends SchemaNodeBase {
  '@type': 'BreadcrumbList'
  itemListElement: BreadcrumbItemNode[]
}

export interface AnswerNode extends SchemaNodeBase {
  '@type': 'Answer'
  text: string
}

export interface QuestionNode extends SchemaNodeBase {
  '@type': 'Question'
  name: string
  acceptedAnswer: AnswerNode
}

export interface FaqPageNode extends SchemaNodeBase {
  '@type': 'FAQPage'
  mainEntity: QuestionNode[]
}

export interface ServiceNode extends SchemaNodeBase {
  '@type': 'Service'
  name: string
  description: string
  url: string
  serviceType?: string
  provider?: { '@id': string } | { '@type': 'Organization'; name: string; url: string }
  image?: string[]
}

/**
 * `AggregateOffer` rather than `Offer`.
 *
 * Nothing in this catalogue has a single "the price is X" figure: a badge is priced per unit on a
 * quantity ladder and a fixed-size banner is priced per size. `AggregateOffer` with `lowPrice` and
 * `highPrice` is the only shape that states that truthfully. See `product.ts` for the eligibility
 * rules and for the kinds that get no offer at all.
 */
export interface AggregateOfferNode extends SchemaNodeBase {
  '@type': 'AggregateOffer'
  priceCurrency: 'NZD'
  lowPrice: number
  highPrice?: number
  offerCount?: number
  url: string
}

export interface ProductNode extends SchemaNodeBase {
  '@type': 'Product'
  name: string
  url: string
  description?: string
  image?: string[]
  category?: string
  offers?: AggregateOfferNode
}

export interface CreativeWorkNode extends SchemaNodeBase {
  '@type': 'CreativeWork'
  name: string
  url: string
  description?: string
  image?: ImageObjectNode[]
  datePublished?: string
  about?: string
}

export type SchemaNode =
  | OrganizationNode
  | LocalBusinessNode
  | WebSiteNode
  | BreadcrumbListNode
  | FaqPageNode
  | ServiceNode
  | ProductNode
  | CreativeWorkNode

/** Drop `undefined` entries so the serialized object contains only facts we hold. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null),
  ) as T
}

/** A non-empty trimmed string, or `undefined`. Never returns `''`. */
export function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

/** A non-empty array, or `undefined`. */
export function optionalList<T>(values: readonly T[] | null | undefined): T[] | undefined {
  if (!values || values.length === 0) return undefined
  return [...values]
}
