/**
 * Typed public service-content model (Jira 10306).
 *
 * A service page mixes three very different kinds of statement:
 *
 *   1. Behaviour the current branch demonstrably implements (which enum values the quote contract
 *      accepts, which options a form offers, that pricing is calculated by the backend).
 *   2. Data that lives in the live catalogue (which products exist, whether they are active).
 *   3. Commercial facts that only the owner can confirm — price, minimum quantity, turnaround,
 *      materials as a *specification*, garment fabric, stock expectations, assurances.
 *
 * Only the third category is a Fair Trading risk, and it is exactly the category no one in this
 * repository has the authority to write. So the model tracks approval **per fact**, not per page:
 * a page can publish its code-confirmed sections while every unapproved commercial detail stays
 * absent — not blank, not "contact us for pricing", absent.
 *
 * This is not a CMS. Definitions are typed modules compiled into the bundle; publishing an approved
 * fact requires a code change and a rebuild, which is the intended review gate.
 *
 * Shared with Jira 10303 rather than reimplemented: `ApprovalRequirement`, the `ContentBlock` body
 * model and its renderers, placeholder detection, and ISO date validation.
 */

import type { IconName } from '@/components/ui/Icon'
import type {
  ApprovalRequirement,
  ContentBlock,
  PublicContentGroup,
} from '@/lib/public-content/types'
import type { ProductKind, QuoteServiceType } from '@/types'

export type { ApprovalRequirement, ContentBlock }

export type ServiceContentStatus = 'draft' | 'published'

/**
 * Where a service statement's authority comes from.
 *
 *   implemented-code        — provable from the current branch (enums, contracts, form options).
 *   catalogue-data          — read live from the public catalogue API at render time.
 *   existing-public-content — the site already advertises this service publicly. Deliberately weak:
 *                             it may support only that the service is offered and how to ask about
 *                             it. It may never support a commercial specification (enforced).
 *   owner-approved          — a business decision the owner has confirmed, with a reference.
 *   legal-approved          — wording that required legal review.
 */
export type ServiceFactBasis =
  | 'implemented-code'
  | 'catalogue-data'
  | 'existing-public-content'
  | 'owner-approved'
  | 'legal-approved'

/**
 * What a section is about. `service-overview` and `quote-process` are the only kinds a
 * `existing-public-content` basis may support, because they assert no specification.
 */
export type ServiceSectionKind =
  | 'service-overview'
  | 'quote-process'
  | 'ordering'
  | 'artwork'
  | 'use-cases'
  | 'owner-statement'

export interface ServiceSectionDefinition {
  /** Stable in-page anchor; kebab-case and unique within the service. */
  id: string
  heading: string
  kind: ServiceSectionKind
  status: ServiceContentStatus
  factBasis: ServiceFactBasis
  /** Source path or approval record. Required to publish — never invented. */
  evidenceReference?: string
  /** ISO date. Required when the basis is owner- or legal-approved. */
  approvedAt?: string
  blocks: ContentBlock[]
}

/**
 * How a value may be described publicly.
 *
 *   requestable-options    — "these are the options you can ask for", provable from a form or enum.
 *   confirmed-specification — "this is what we supply". Requires owner approval (enforced).
 */
export type ServiceFactPresentation = 'requestable-options' | 'confirmed-specification'

export interface ApprovedServiceFact<T> {
  value: T
  status: ServiceContentStatus
  factBasis: ServiceFactBasis
  /** Source path or approval record. A published fact without one is a validation failure. */
  evidenceReference: string
  /** ISO date the approval was recorded. Required for owner/legal-approved facts. */
  approvedAt?: string
  presentation: ServiceFactPresentation
  /** Catalogue scope. Required for product-scoped minimums and garment specifications. */
  productId?: string
  /** Short qualifier rendered with the value, e.g. how a size preset is used. */
  note?: string
}

/**
 * Price shapes are kept distinct because they carry different promises. `quote-only` is the only
 * shape that can be supported without an owner approval, because it restates the implemented quote
 * model rather than asserting an amount.
 */
export type ServicePriceValue =
  | { kind: 'quote-only' }
  | { kind: 'from'; currency: 'NZD'; amount: number; unit?: string }
  | { kind: 'range'; currency: 'NZD'; minAmount: number; maxAmount: number; unit?: string }
  | { kind: 'per-unit'; currency: 'NZD'; amount: number; unit: string }

/**
 * A minimum quantity is meaningless without its scope. A pricing ladder's lowest break is not a
 * service minimum, and one product's minimum is not every product's minimum.
 */
export interface ServiceMinimumQuantityValue {
  value: number
  scope: 'product' | 'pricing-tier' | 'service-wide'
  unit: string
}

export interface ServiceSpecificationEntry {
  label: string
  value: string
}

export interface ServiceFaqEntry {
  id: string
  question: string
  answer: string
  status: ServiceContentStatus
  factBasis: ServiceFactBasis
  evidenceReference?: string
  approvedAt?: string
}

/**
 * The approval-controlled commercial facts. Every slot is optional: an absent slot renders nothing
 * at all — no heading, no "not available" row. `undefined` means "we have not been told", which is
 * the honest default; it is never used as a substitute for approval state, because a *present* fact
 * always carries its own `status` and evidence.
 */
export interface ServiceFacts {
  sizes?: ApprovedServiceFact<string[]>
  materials?: ApprovedServiceFact<string[]>
  finishes?: ApprovedServiceFact<string[]>
  minimumQuantity?: ApprovedServiceFact<ServiceMinimumQuantityValue>
  price?: ApprovedServiceFact<ServicePriceValue>
  turnaround?: ApprovedServiceFact<string>
  artworkSpecification?: ApprovedServiceFact<string[]>
  garmentSpecification?: ApprovedServiceFact<ServiceSpecificationEntry[]>
  stockExpectation?: ApprovedServiceFact<string>
  serviceAssurance?: ApprovedServiceFact<string>
}

export type ServiceFactKey = keyof ServiceFacts

export interface ServiceHeroDefinition {
  eyebrow: string
  headline: string
  summary: string
}

export interface ServiceHelpLink {
  group: PublicContentGroup
  slug: string
}

export interface ServicePageDefinition {
  slug: string
  name: string
  /** Used in cards, navigation and CTA labels ("Request a quote for pull-up banners"). */
  shortName: string
  /** Meta description and page intro. */
  description: string
  /** One line for the service index, homepage grid and footer. */
  cardSummary: string
  /**
   * Decorative only; paired with the visible title, never the sole label.
   *
   * Jira 10307 replaced a free-text emoji with a key into the shared icon family
   * (`components/ui/Icon.tsx`). An emoji was neither typed nor consistent: it
   * rendered as a different illustration on every platform, could not inherit
   * the surrounding text colour, and let a service card be given an unrelated
   * picture with no compile-time check.
   */
  iconName: IconName
  sortOrder: number

  status: ServiceContentStatus
  approvalRequirement: ApprovalRequirement
  approvalReference?: string
  approvedAt?: string
  lastReviewedAt: string

  /** Stable Jira 10301 classification. Drives the quote deep-link and the portfolio filter. */
  quoteServiceType: QuoteServiceType

  hero: ServiceHeroDefinition
  sections: ServiceSectionDefinition[]
  facts: ServiceFacts
  faqs: ServiceFaqEntry[]

  /** Explicit catalogue mapping. GUIDs only — validated, never customer-supplied. */
  relatedProductIds?: string[]
  /** Kind-based mapping, resolved live against active public products. */
  relatedProductKinds?: ProductKind[]
  /** Heading for the catalogue section. Says exactly what the list is, so a kind-based mapping is
   *  never presented as "these products are all made of X". */
  relatedProductsHeading?: string
  relatedProductsNote?: string
  /** Portfolio filter. Must equal `quoteServiceType` — a mismatch is a validation failure. */
  portfolioServiceType?: QuoteServiceType
  /** Jira 10303 documents. Draft or unknown targets are a validation failure. */
  relatedHelpLinks?: ServiceHelpLink[]

  /** Plain-words reason, shown only in the non-production draft banner and the approval report. */
  draftReason?: string

  /**
   * Commercial facts this page still needs before it can say more. Machine-readable so the approval
   * report and the evidence document cannot drift from the definitions. Never rendered publicly —
   * a public page states what is confirmed and is silent about the rest.
   */
  pendingApprovals?: string[]
}
