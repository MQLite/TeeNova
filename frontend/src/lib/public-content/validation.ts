/**
 * Publication gate for typed public content (Jira 10303).
 *
 * `evaluatePublication` is the single authority for "may this document be rendered to the public".
 * Routes, navigation, related links and the approval-registry report all call it; none of them
 * re-implement the rule. A document that fails any check is treated exactly as if it did not exist.
 */

import type {
  ContentBlock,
  PublicContentDocument,
  PublicContentSection,
} from './types'

/**
 * Markers that indicate unfinished or unapproved wording. Any occurrence inside text that would be
 * publicly rendered blocks publication outright — reviewer discipline is not relied on.
 */
const PLACEHOLDER_PHRASES: readonly string[] = [
  'todo',
  'tbd',
  'tbc',
  'lorem ipsum',
  'insert policy',
  'ask owner',
  'draft wording',
  'legal review required',
  'example only',
  'placeholder',
  'xxx',
  'coming soon',
]

/** Unresolved template tokens: `{{ ... }}` and bracketed fill-in slots such as `[insert date]`. */
const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /\{\{[\s\S]*?\}\}/,
  /\[[^\]\n]*\]/,
]

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface PublicationEvaluation {
  publishable: boolean
  /** Sections that may be rendered publicly (empty whenever `publishable` is false). */
  publishedSections: PublicContentSection[]
  problems: string[]
}

function blockText(block: ContentBlock): string[] {
  switch (block.kind) {
    case 'paragraph':
      return [block.text]
    case 'list':
      return block.items
    case 'definitions':
      return block.items.flatMap((item) => [item.term, item.description])
    case 'table':
      return [block.caption, ...block.columns, ...block.rows.flat()]
    case 'notice':
      return block.title ? [block.title, block.text] : [block.text]
  }
}

/** Every string a reader could see if the document were published as-is. */
export function publicText(document: PublicContentDocument): string[] {
  const sections = document.sections.filter((section) => section.status === 'published')
  return [
    document.title,
    document.description,
    document.classification,
    ...sections.flatMap((section) => [section.heading, ...section.blocks.flatMap(blockText)]),
  ]
}

export function findPlaceholders(values: readonly string[]): string[] {
  const found = new Set<string>()
  for (const value of values) {
    const lower = value.toLowerCase()
    for (const phrase of PLACEHOLDER_PHRASES) {
      // Word-boundary match so ordinary prose ("...to do the work") is not flagged.
      if (new RegExp(`\\b${phrase}\\b`).test(lower)) found.add(phrase)
    }
    for (const pattern of PLACEHOLDER_PATTERNS) {
      const match = pattern.exec(value)
      if (match) found.add(match[0])
    }
  }
  return [...found]
}

/**
 * Exported for the Jira 10306 service-content gate, which must apply the same date rules rather
 * than growing a second, slightly different implementation.
 */
export function isValidPastOrPresentDate(value: string, today: Date): boolean {
  if (!ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.valueOf())) return false
  if (value !== parsed.toISOString().slice(0, 10)) return false
  const midnightToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  )
  return parsed <= midnightToday
}

export function isValidDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && value === parsed.toISOString().slice(0, 10)
}

const requiresOwner = (document: PublicContentDocument) =>
  document.approvalRequirement === 'owner' || document.approvalRequirement === 'owner-and-legal'

const requiresLegal = (document: PublicContentDocument) =>
  document.approvalRequirement === 'legal' || document.approvalRequirement === 'owner-and-legal'

export function evaluatePublication(
  document: PublicContentDocument,
  today: Date = new Date(),
): PublicationEvaluation {
  const problems: string[] = []

  if (!SLUG.test(document.slug)) problems.push('slug must be lower-case kebab-case')

  const sectionIds = document.sections.map((section) => section.id)
  if (new Set(sectionIds).size !== sectionIds.length) problems.push('section anchors must be unique')
  for (const id of sectionIds) {
    if (!SLUG.test(id)) problems.push(`section anchor "${id}" must be lower-case kebab-case`)
  }

  if (document.status !== 'published') {
    problems.push('document status is draft')
    return { publishable: false, publishedSections: [], problems }
  }

  const publishedSections = document.sections.filter((section) => section.status === 'published')
  if (publishedSections.length === 0) problems.push('no published sections')

  if (requiresOwner(document) || requiresLegal(document)) {
    if (!document.approvalReference?.trim()) {
      problems.push(`approval reference required for "${document.approvalRequirement}" approval`)
    }
    if (!document.approvedAt || !isValidPastOrPresentDate(document.approvedAt, today)) {
      problems.push('a valid recorded approval date is required')
    }
  }

  if (!document.lastReviewedAt || !isValidPastOrPresentDate(document.lastReviewedAt, today)) {
    problems.push('a valid last-reviewed date is required')
  }

  if (document.effectiveFrom !== undefined && !isValidDate(document.effectiveFrom)) {
    problems.push('effective-from date is invalid')
  }

  // Published sections that assert an owner or legal decision must name the approval record that
  // authorises them. Code-derived and configuration-driven sections carry a source reference.
  for (const section of publishedSections) {
    if (!section.evidenceReference?.trim()) {
      problems.push(`section "${section.id}" has no evidence or approval reference`)
    }
  }

  const placeholders = findPlaceholders(publicText(document))
  if (placeholders.length > 0) {
    problems.push(`placeholder content present: ${placeholders.join(', ')}`)
  }

  const publishable = problems.length === 0
  return { publishable, publishedSections: publishable ? publishedSections : [], problems }
}
