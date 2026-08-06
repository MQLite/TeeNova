/**
 * Typed public content model for policy and customer-help pages (Jira 10303).
 *
 * The model exists so that "unknown or unapproved content must not be published" is a code path
 * rather than a reviewer promise. Nothing here is a CMS: documents are typed modules compiled into
 * the bundle, there is no runtime authoring surface, no database table and no API.
 *
 * Two independent gates apply:
 *   1. Document gate  — `status` plus the approval evidence required by `approvalRequirement`.
 *   2. Section gate   — each section carries its own `status`, so a document can publish the parts
 *                       that are confirmed by implemented code while owner/legal-dependent sections
 *                       stay Draft and are never rendered publicly.
 *
 * Body content is structured data rendered through React components. Raw HTML strings are not part
 * of the model and `dangerouslySetInnerHTML` is never used.
 */

export type PublicContentStatus = 'draft' | 'published'

export type ApprovalRequirement = 'none' | 'owner' | 'legal' | 'owner-and-legal'

export type PublicContentGroup = 'help' | 'policies'

/**
 * Where a statement's authority comes from. This is metadata for the approval registry and the
 * evidence document — it is not rendered as marketing copy.
 *
 *   implemented-code — provable from the current branch (limits, storage location, flags, enums).
 *   configurable     — an operational value supplied through configuration, not hard-coded.
 *   owner-approved   — a business decision that only the owner can confirm.
 *   legal-approved   — wording that requires legal review before publication.
 */
export type FactBasis = 'implemented-code' | 'configurable' | 'owner-approved' | 'legal-approved'

export interface ContentParagraphBlock {
  kind: 'paragraph'
  text: string
}

export interface ContentListBlock {
  kind: 'list'
  ordered?: boolean
  items: string[]
}

export interface ContentDefinitionsBlock {
  kind: 'definitions'
  items: { term: string; description: string }[]
}

export interface ContentTableBlock {
  kind: 'table'
  /** Required: every table is rendered with a real <caption> (Phase 18 accessibility). */
  caption: string
  columns: string[]
  rows: string[][]
}

export interface ContentNoticeBlock {
  kind: 'notice'
  tone: 'info' | 'caution'
  title?: string
  text: string
}

export type ContentBlock =
  | ContentParagraphBlock
  | ContentListBlock
  | ContentDefinitionsBlock
  | ContentTableBlock
  | ContentNoticeBlock

export interface PublicContentSection {
  /** Stable in-page anchor id; kebab-case and unique within the document. */
  id: string
  heading: string
  status: PublicContentStatus
  factBasis: FactBasis
  /**
   * Evidence for this section. For `implemented-code` sections this is the source path the
   * statement was derived from; for owner/legal sections it is the approval record reference and
   * must be supplied by the approver — it is never invented here.
   */
  evidenceReference?: string
  blocks: ContentBlock[]
}

export interface PublicContentRelatedLink {
  group: PublicContentGroup
  slug: string
}

export interface PublicContentDocument {
  group: PublicContentGroup
  /** Stable URL slug, kebab-case, unique within the group. */
  slug: string
  title: string
  description: string
  /** Short human classification rendered on the page, e.g. "Customer help" or "Policy". */
  classification: string
  status: PublicContentStatus
  approvalRequirement: ApprovalRequirement
  /** Required to publish whenever `approvalRequirement` is not `none`. Never fabricate. */
  approvalReference?: string
  /** ISO date (YYYY-MM-DD) the approval was recorded. */
  approvedAt?: string
  /** ISO date (YYYY-MM-DD) the content was last reviewed. Required to publish. */
  lastReviewedAt?: string
  /** ISO date (YYYY-MM-DD) the content takes effect, where relevant. */
  effectiveFrom?: string
  sections: PublicContentSection[]
  related?: PublicContentRelatedLink[]
  /**
   * Why this document is still Draft, in plain words. Rendered only in the non-production draft
   * banner and surfaced in the approval registry report — never on a published public page.
   */
  draftReason?: string
}
