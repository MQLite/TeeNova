/**
 * `WebSite`, `Organization` and `LocalBusiness` (Jira 10308 Phases 15 and 16).
 *
 * ## Why `LocalBusiness` is normally absent
 *
 * A `LocalBusiness` node is the highest-consequence structured data on a shop's site: it is what
 * feeds a knowledge panel and a map listing, and a wrong opening hour in it sends a customer to a
 * locked door on a Sunday. Jira 10300 records the public business name (A01/A02), the opening hours
 * (A09) and street address (A07) as unresolved while the public telephone (A05) is now supplied.
 * So the node is built by a gate, not by a template: it appears when the facts are approved and is
 * absent when they are not. A thin node carrying only a name is worse than no node — it asserts an
 * identity the owner has not chosen, and search engines treat contradictions between visible content
 * and structured data as a quality signal against the site.
 *
 * ## Why `WebSite` is still emitted
 *
 * `WebSite.name` describes *this website*, not the legal entity. The site is visibly titled
 * "Otahuhu Printing Shop" on every page, so saying so in the graph restates what a visitor already
 * reads. It carries no address, no hours and no contact point, so it cannot mislead anyone about
 * where to go or when.
 *
 * No `SearchAction` is declared. The products page filters client-side over a single fetched list;
 * there is no documented public search-results URL contract that a consumer could fill in, and
 * inventing one would send crawlers to a URL that answers nothing useful.
 */

import { brandFullName } from '@/lib/site-brand'
import {
  approvedBusinessFacts,
  localBusinessEligible,
  type OpeningHoursRow,
  type ShopAddress,
} from '@/lib/site-business'
import { siteLanguage } from '../identity'
import { sameAsUrls } from '../social-profiles'
import { absoluteUrl, siteOrigin } from '../site-url'
import { organizationId, websiteId } from './ids'
import {
  compact,
  optionalList,
  optionalText,
  type LocalBusinessNode,
  type OpeningHoursSpecificationNode,
  type OrganizationNode,
  type PostalAddressNode,
  type WebSiteNode,
} from './types'

const addressNode = (address: ShopAddress): PostalAddressNode => ({
  '@type': 'PostalAddress',
  streetAddress: address.streetAddress,
  addressLocality: address.addressLocality,
  addressRegion: address.addressRegion,
  postalCode: address.postalCode,
  addressCountry: address.addressCountry,
})

const hoursNodes = (rows: readonly OpeningHoursRow[]): OpeningHoursSpecificationNode[] =>
  rows.map((row) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: [...row.days],
    opens: row.opens,
    closes: row.closes,
  }))

/**
 * Resolve an approved logo URL.
 *
 * Returns `undefined` unless a logo has been explicitly configured. The `app/icon.svg` and
 * `app/apple-icon.png` files added in Jira 10307 are documented placeholders derived from the
 * existing inline glyph — they are a browser-tab icon, not an approved company logo (A34), and
 * publishing one as `Organization.logo` would present it as the business's mark.
 */
function approvedLogoUrl(): string | undefined {
  const configured = approvedBusinessFacts().logoUrl
  if (!configured) return undefined
  if (/^https?:\/\//i.test(configured)) return configured
  return absoluteUrl(configured) ?? undefined
}

/** `WebSite`. Emitted whenever the site origin is known. */
export function buildWebSite(): WebSiteNode | null {
  const origin = siteOrigin()
  const id = websiteId()
  if (!origin || !id) return null

  const organization = localBusinessEligible() ? organizationId() : null

  return compact<WebSiteNode>({
    '@type': 'WebSite',
    '@id': id,
    name: brandFullName,
    url: `${origin}/`,
    inLanguage: siteLanguage,
    ...(organization ? { publisher: { '@id': organization } } : {}),
  })
}

/**
 * `LocalBusiness`, or `null` while the identity and address approvals are open.
 *
 * Every optional field is independently gated: approving the name does not release the phone
 * number, and approving the address does not release the opening hours. The node grows one
 * approval at a time rather than appearing all at once.
 */
export function buildLocalBusiness(): LocalBusinessNode | null {
  const origin = siteOrigin()
  const id = organizationId()
  if (!origin || !id) return null
  if (!localBusinessEligible()) return null

  const facts = approvedBusinessFacts()
  const name = optionalText(facts.name)
  const address = facts.address
  if (!name || !address) return null

  return compact<LocalBusinessNode>({
    '@type': 'LocalBusiness',
    '@id': id,
    name,
    url: `${origin}/`,
    legalName: optionalText(facts.legalName),
    email: optionalText(facts.email),
    telephone: optionalText(facts.telephone),
    logo: approvedLogoUrl(),
    address: addressNode(address),
    openingHoursSpecification: facts.openingHours ? hoursNodes(facts.openingHours) : undefined,
    areaServed: optionalList(facts.areaServed),
    priceRange: optionalText(facts.priceRange),
    sameAs: optionalList(sameAsUrls()),
    // Deliberately never set: aggregateRating and review. No verified rating or review source
    // exists (Jira 10300 A28/A29), and a fabricated one is both an SEO penalty and a consumer-law
    // problem. There is no configuration switch for them — supplying them requires code review.
  })
}

/**
 * Minimal `Organization`, used only when `LocalBusiness` is not eligible.
 *
 * Kept behind the same identity gate: `Organization.name` is a claim about what the business is
 * called, which is exactly the unresolved question. Returning `null` here is the expected result
 * today, and the `WebSite` node above carries the site's own title instead.
 */
export function buildOrganization(): OrganizationNode | null {
  const origin = siteOrigin()
  const id = organizationId()
  if (!origin || !id) return null
  if (localBusinessEligible()) return null

  const facts = approvedBusinessFacts()
  const name = optionalText(facts.name)
  if (!name) return null

  return compact<OrganizationNode>({
    '@type': 'Organization',
    '@id': id,
    name,
    url: `${origin}/`,
    legalName: optionalText(facts.legalName),
    email: optionalText(facts.email),
    telephone: optionalText(facts.telephone),
    logo: approvedLogoUrl(),
    sameAs: optionalList(sameAsUrls()),
  })
}

/** The site-wide graph: whichever of the three nodes are currently accurate. */
export function siteGraph(): (WebSiteNode | LocalBusinessNode | OrganizationNode)[] {
  return [buildWebSite(), buildLocalBusiness(), buildOrganization()].filter(
    (node): node is WebSiteNode | LocalBusinessNode | OrganizationNode => node !== null,
  )
}

/** Reference to the business entity, for `Service.provider`. Null while identity is unapproved. */
export function providerReference(): { '@id': string } | undefined {
  if (!localBusinessEligible()) return undefined
  const id = organizationId()
  return id ? { '@id': id } : undefined
}
