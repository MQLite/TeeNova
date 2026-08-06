/**
 * Publication gate for service content (Jira 10306).
 *
 * `evaluateServicePublication` is the single authority for "may this service page be rendered to
 * the public", and `renderableFacts` is the single authority for "may this commercial fact be
 * rendered at all". Routes, the index, the homepage grid, the footer and the approval report all
 * call them; none re-implements the rule.
 *
 * The gate is deliberately fail-closed and total: when a service fails, the evaluation returns
 * **no** sections, **no** facts and **no** FAQ entries, so a partly valid page cannot leak its
 * valid half under a heading that implies the rest was reviewed too.
 */

import { findPlaceholders, isValidDate, isValidPastOrPresentDate } from '@/lib/public-content/validation'
import { findDocument, isPublished as isPublishedDocument } from '@/lib/public-content/registry'
import { SERVICE_OPTIONS } from '@/app/quote/quote-form-validation'
import type { ProductKind } from '@/types'
import type {
  ApprovedServiceFact,
  ServiceFactKey,
  ServiceFacts,
  ServiceFaqEntry,
  ServicePageDefinition,
  ServicePriceValue,
  ServiceSectionDefinition,
} from './types'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PRODUCT_KINDS: readonly ProductKind[] = ['Garment', 'Badge', 'Banner', 'Other']

/**
 * Service-specific unfinished-content markers, applied on top of the Jira 10303 list. These are the
 * shapes an unfinished service page actually takes.
 */
const SERVICE_PLACEHOLDER_PHRASES: readonly string[] = [
  'starting from tbd',
  'ask for price',
  'sample price',
  'example product',
  'generic service',
  'price on application',
  'from \\$x',
]

/**
 * Commercial claims that may never appear in free prose, because prose carries no approval state.
 * A price, a turnaround or a minimum has to come through its typed fact or not at all.
 *
 * Every pattern is anchored to a *promissory* shape rather than a bare topic word, so a sentence
 * that says a figure has not been confirmed is still writable. Asserted by test.
 */
const UNSUPPORTED_CLAIM_PATTERNS: readonly { pattern: RegExp; problem: string }[] = [
  {
    pattern: /(?:NZ\s*)?\$\s*\d/i,
    problem: 'a currency amount appears in prose — prices must come through the approved price fact',
  },
  {
    pattern: /\bwithin\s+\d+\s*(?:hours?|days?|weeks?)\b|\b\d+\s*(?:business|working)\s+days?\b|\b(?:same|next)[- ]day\b|\b(?:fast|quick|rapid|express)\s+turnaround\b|\b(?:24|48)\s*hours?\b/i,
    problem: 'a turnaround promise appears in prose — turnaround needs owner approval',
  },
  {
    pattern: /\bfree\s+(?:shipping|delivery)\b|\bnz[- ]wide\b|\bnationwide\b|\bdelivery\s+included\b|\bwe\s+deliver\s+(?:to|anywhere|across)\b/i,
    problem: 'a delivery claim appears in prose — delivery coverage needs owner approval',
  },
  {
    pattern: /\b(?:gst\s+(?:inclusive|included)|including\s+gst|plus\s+gst|excl\.?\s*gst)\b/i,
    problem: 'a GST claim appears in prose — tax treatment is not confirmed',
  },
  {
    pattern: /\bguarantee[ds]?\b|\bmoney[- ]back\b|\bwarrant(?:y|ies)\b|\b100%\s+(?:satisfaction|quality)\b/i,
    problem: 'a guarantee appears in prose — no assurance is approved',
  },
  {
    pattern: /\bminimum\s+(?:order\s+)?(?:quantity\s+)?(?:of\s+)?\d+\b|\bno\s+minimum\b|\bminimum\s+\d+\b/i,
    problem: 'a minimum quantity appears in prose — minimums must come through the approved fact',
  },
  {
    pattern: /\b\d+\s*gsm\b|\b\d+\s*%\s*(?:cotton|polyester|poly)\b|\bpremium\s+cotton\b|\bwater[- ]?proof\b|\bweather[- ]?proof\b|\buv[- ]?resistant\b|\bmachine\s+washable\b|\btumble\s+dry\b|\bcold\s+wash\b/i,
    problem: 'a material or care specification appears in prose — specifications need owner approval',
  },
  {
    pattern: /\bin\s+stock\b|\balways\s+available\b|\bready\s+to\s+(?:ship|print)\b/i,
    problem: 'a stock expectation appears in prose — stock is not confirmed',
  },
]

/** Internal detail that must never reach a public page. */
const LEAK_PATTERNS: readonly { pattern: RegExp; problem: string }[] = [
  { pattern: /App_Data|wwwroot|[A-Za-z]:\\|\/home\/|localhost:\d+/i, problem: 'internal file path or host' },
  { pattern: /\/admin(?:\/|\b)/i, problem: 'admin route' },
  { pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, problem: 'email address (use the contact helper)' },
  { pattern: /\b[0-9a-f]{32}\b/i, problem: 'storage object key' },
]

export interface ServicePublicationEvaluation {
  publishable: boolean
  sections: ServiceSectionDefinition[]
  facts: ServiceFacts
  faqs: ServiceFaqEntry[]
  problems: string[]
}

// ── Fact-level rules ────────────────────────────────────────────────────────────────────────────

const isOwnerApproved = (fact: ApprovedServiceFact<unknown>) =>
  fact.factBasis === 'owner-approved' || fact.factBasis === 'legal-approved'

function priceProblems(fact: ApprovedServiceFact<ServicePriceValue>): string[] {
  const problems: string[] = []
  const value = fact.value
  if (value.kind === 'quote-only') {
    // Restates the implemented enquiry model; it asserts no amount, so code evidence is enough.
    return problems
  }
  if (!isOwnerApproved(fact)) {
    problems.push('a price amount requires owner approval')
  }
  if (value.currency !== 'NZD') problems.push('service prices must be recorded in NZD')
  const amounts =
    value.kind === 'range' ? [value.minAmount, value.maxAmount] : [value.amount]
  if (amounts.some((amount) => !Number.isFinite(amount) || amount <= 0)) {
    problems.push('price amounts must be positive numbers')
  }
  if (value.kind === 'range' && value.minAmount >= value.maxAmount) {
    problems.push('a price range must run from a lower to a higher amount')
  }
  if (fact.presentation !== 'confirmed-specification') {
    // Reached only for an amount-bearing price (`quote-only` returned above). A published amount is
    // read by a customer as real, so recording it as a merely "requestable option" would present an
    // indicative figure as though it were authoritative.
    problems.push('a published price must be recorded as a confirmed specification')
  }
  return problems
}

/**
 * Rules for one fact slot. Returns the reasons it may not be rendered; an empty array means the
 * fact is safe to show.
 */
export function factProblems(
  key: ServiceFactKey,
  fact: ApprovedServiceFact<unknown>,
  today: Date,
): string[] {
  const problems: string[] = []
  if (fact.status !== 'published') return [`${key} is draft`]

  if (!fact.evidenceReference?.trim()) problems.push(`${key} has no evidence reference`)

  if (fact.factBasis === 'existing-public-content') {
    problems.push(`${key} may not rest on existing public content — it is a specification`)
  }

  if (isOwnerApproved(fact) && !(fact.approvedAt && isValidPastOrPresentDate(fact.approvedAt, today))) {
    problems.push(`${key} needs a valid, non-future approval date`)
  }

  if (fact.presentation === 'confirmed-specification' && !isOwnerApproved(fact) && key !== 'price') {
    problems.push(`${key} is presented as a confirmed specification without owner approval`)
  }

  switch (key) {
    case 'price':
      problems.push(...priceProblems(fact as ApprovedServiceFact<ServicePriceValue>))
      break
    case 'turnaround':
      if (!isOwnerApproved(fact)) problems.push('turnaround requires owner approval')
      break
    case 'minimumQuantity': {
      const value = fact.value as { value: number; scope: string }
      if (!Number.isInteger(value.value) || value.value < 1) {
        problems.push('a minimum quantity must be a positive whole number')
      }
      if (value.scope === 'service-wide' && !isOwnerApproved(fact)) {
        problems.push('a service-wide minimum requires owner approval')
      }
      if (value.scope === 'product' && !fact.productId) {
        problems.push('a product minimum must name the product it came from')
      }
      break
    }
    case 'garmentSpecification':
      if (!isOwnerApproved(fact)) problems.push('garment specifications require owner approval')
      if (!fact.productId) problems.push('a garment specification must be scoped to one product')
      break
    case 'stockExpectation':
      if (!isOwnerApproved(fact)) problems.push('stock expectations require owner approval')
      break
    case 'serviceAssurance':
      if (!isOwnerApproved(fact)) problems.push('service assurances require owner approval')
      break
    case 'sizes':
    case 'materials':
    case 'finishes':
    case 'artworkSpecification': {
      const value = fact.value as unknown[]
      if (!Array.isArray(value) || value.length === 0) problems.push(`${key} has no values`)
      break
    }
  }

  return problems
}

const FACT_KEYS: readonly ServiceFactKey[] = [
  'sizes',
  'materials',
  'finishes',
  'minimumQuantity',
  'price',
  'turnaround',
  'artworkSpecification',
  'garmentSpecification',
  'stockExpectation',
  'serviceAssurance',
]

/** The facts that individually pass their rules. Everything else is simply absent. */
export function renderableFacts(service: ServicePageDefinition, today: Date = new Date()): ServiceFacts {
  const safe: ServiceFacts = {}
  for (const key of FACT_KEYS) {
    const fact = service.facts[key]
    if (!fact) continue
    if (factProblems(key, fact, today).length === 0) {
      // The per-key types are exact; the loop is the only place a widening cast is needed.
      ;(safe as Record<string, unknown>)[key] = fact
    }
  }
  return safe
}

// ── FAQ rules ───────────────────────────────────────────────────────────────────────────────────

/** Topics a service FAQ may not answer without owner approval. */
const RESTRICTED_FAQ_TOPICS: readonly { pattern: RegExp; topic: string }[] = [
  { pattern: /\bturnaround\b|\bhow long\b|\blead time\b/i, topic: 'turnaround' },
  { pattern: /\bdeliver\w*\b|\bshipping\b|\bcourier\b/i, topic: 'delivery' },
  { pattern: /\brefund\w*\b|\breprint\w*\b|\breturn\w*\b/i, topic: 'returns' },
  { pattern: /\bguarantee\w*\b|\bwarrant\w*\b/i, topic: 'guarantees' },
  { pattern: /\bfade\w*\b|\bdurab\w*\b|\blast\s+for\b|\bwash\w*\b/i, topic: 'material performance' },
]

export function faqProblems(entry: ServiceFaqEntry, today: Date): string[] {
  const problems: string[] = []
  if (entry.status !== 'published') return ['faq entry is draft']
  if (!SLUG.test(entry.id)) problems.push(`faq anchor "${entry.id}" must be lower-case kebab-case`)
  if (!entry.question.trim() || !entry.answer.trim()) problems.push(`faq "${entry.id}" is empty`)
  if (!entry.evidenceReference?.trim()) {
    problems.push(`faq "${entry.id}" has no evidence or approval reference`)
  }
  const ownerApproved = entry.factBasis === 'owner-approved' || entry.factBasis === 'legal-approved'
  if (ownerApproved && !(entry.approvedAt && isValidPastOrPresentDate(entry.approvedAt, today))) {
    problems.push(`faq "${entry.id}" needs a valid, non-future approval date`)
  }
  if (!ownerApproved) {
    const text = `${entry.question} ${entry.answer}`
    for (const { pattern, topic } of RESTRICTED_FAQ_TOPICS) {
      if (pattern.test(text)) {
        problems.push(`faq "${entry.id}" answers ${topic}, which requires owner approval`)
      }
    }
  }
  return problems
}

// ── Public text ─────────────────────────────────────────────────────────────────────────────────

function blockText(block: ServiceSectionDefinition['blocks'][number]): string[] {
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

function factText(facts: ServiceFacts): string[] {
  const values: string[] = []
  for (const key of FACT_KEYS) {
    const fact = facts[key]
    if (!fact || fact.status !== 'published') continue
    if (fact.note) values.push(fact.note)
    const value = fact.value
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') values.push(entry)
        else if (entry && typeof entry === 'object') values.push(...Object.values(entry as object).map(String))
      }
    } else if (typeof value === 'string') {
      values.push(value)
    }
  }
  return values
}

/**
 * Every string a reader could see if the service published as-is.
 *
 * Numeric fact values (price amounts, minimum quantities) are deliberately excluded from the
 * unsupported-claim scan: they carry their own approval state, and running the "no currency amount
 * in prose" rule over an approved price would reject the very thing that was approved.
 */
export function servicePublicText(service: ServicePageDefinition): string[] {
  const sections = service.sections.filter((section) => section.status === 'published')
  const faqs = service.faqs.filter((entry) => entry.status === 'published')
  return [
    service.name,
    service.shortName,
    service.description,
    service.cardSummary,
    service.hero.eyebrow,
    service.hero.headline,
    service.hero.summary,
    ...sections.flatMap((section) => [section.heading, ...section.blocks.flatMap(blockText)]),
    ...faqs.flatMap((entry) => [entry.question, entry.answer]),
    ...factText(service.facts),
  ]
}

export function findServicePlaceholders(values: readonly string[]): string[] {
  const found = new Set(findPlaceholders(values))
  for (const value of values) {
    const lower = value.toLowerCase()
    for (const phrase of SERVICE_PLACEHOLDER_PHRASES) {
      if (new RegExp(`\\b${phrase}\\b`).test(lower)) found.add(phrase.replace('\\', ''))
    }
  }
  return [...found]
}

/** Prose-level claim scan. Applied to section, hero and FAQ text only — never to approved facts. */
export function findUnsupportedClaims(values: readonly string[]): string[] {
  const found = new Set<string>()
  for (const value of values) {
    for (const { pattern, problem } of UNSUPPORTED_CLAIM_PATTERNS) {
      if (pattern.test(value)) found.add(problem)
    }
  }
  return [...found]
}

export function findLeaks(values: readonly string[]): string[] {
  const found = new Set<string>()
  for (const value of values) {
    for (const { pattern, problem } of LEAK_PATTERNS) {
      if (pattern.test(value)) found.add(problem)
    }
  }
  return [...found]
}

// ── The gate ────────────────────────────────────────────────────────────────────────────────────

const VALID_QUOTE_SERVICES = new Set(SERVICE_OPTIONS.map((option) => option.value))

/** Minimum published prose before a page counts as saying anything. */
const MEANINGFUL_PROSE_CHARACTERS = 200

const requiresOwner = (service: ServicePageDefinition) =>
  service.approvalRequirement === 'owner' || service.approvalRequirement === 'owner-and-legal'
const requiresLegal = (service: ServicePageDefinition) =>
  service.approvalRequirement === 'legal' || service.approvalRequirement === 'owner-and-legal'

const EMPTY: Pick<ServicePublicationEvaluation, 'sections' | 'facts' | 'faqs'> = {
  sections: [],
  facts: {},
  faqs: [],
}

export function evaluateServicePublication(
  service: ServicePageDefinition,
  today: Date = new Date(),
): ServicePublicationEvaluation {
  const problems: string[] = []

  if (!SLUG.test(service.slug)) problems.push('slug must be lower-case kebab-case')
  if (!service.name.trim()) problems.push('name is empty')
  if (!service.shortName.trim()) problems.push('short name is empty')
  if (!service.description.trim()) problems.push('description is empty')
  if (!service.cardSummary.trim()) problems.push('card summary is empty')

  if (!VALID_QUOTE_SERVICES.has(service.quoteServiceType)) {
    problems.push(`"${service.quoteServiceType}" is not a valid quote service classification`)
  }
  if (service.portfolioServiceType && service.portfolioServiceType !== service.quoteServiceType) {
    problems.push('the portfolio filter must use the same service classification as the quote link')
  }

  const sectionIds = service.sections.map((section) => section.id)
  if (new Set(sectionIds).size !== sectionIds.length) problems.push('section anchors must be unique')
  for (const id of sectionIds) {
    if (!SLUG.test(id)) problems.push(`section anchor "${id}" must be lower-case kebab-case`)
  }

  if (service.status !== 'published') {
    problems.push('service status is draft')
    return { publishable: false, ...EMPTY, problems }
  }

  if (requiresOwner(service) || requiresLegal(service)) {
    if (!service.approvalReference?.trim()) {
      problems.push(`approval reference required for "${service.approvalRequirement}" approval`)
    }
    if (!service.approvedAt || !isValidPastOrPresentDate(service.approvedAt, today)) {
      problems.push('a valid recorded approval date is required')
    }
  }

  if (!service.lastReviewedAt || !isValidPastOrPresentDate(service.lastReviewedAt, today)) {
    problems.push('a valid last-reviewed date is required')
  }
  if (service.approvedAt !== undefined && !isValidDate(service.approvedAt)) {
    problems.push('approval date is not a valid ISO date')
  }

  const publishedSections = service.sections.filter((section) => section.status === 'published')
  if (publishedSections.length === 0) problems.push('no published sections')

  for (const section of publishedSections) {
    if (!section.evidenceReference?.trim()) {
      problems.push(`section "${section.id}" has no evidence or approval reference`)
    }
    const ownerBasis = section.factBasis === 'owner-approved' || section.factBasis === 'legal-approved'
    if (ownerBasis && !(section.approvedAt && isValidPastOrPresentDate(section.approvedAt, today))) {
      problems.push(`section "${section.id}" needs a valid, non-future approval date`)
    }
    if (
      section.factBasis === 'existing-public-content' &&
      section.kind !== 'service-overview' &&
      section.kind !== 'quote-process'
    ) {
      problems.push(
        `section "${section.id}" rests on existing public content but asserts a "${section.kind}" specification`,
      )
    }
  }

  const proseLength = publishedSections
    .flatMap((section) => section.blocks.flatMap(blockText))
    .join(' ')
    .trim().length
  if (publishedSections.length > 0 && proseLength < MEANINGFUL_PROSE_CHARACTERS) {
    problems.push('no meaningful published content')
  }

  for (const id of service.relatedProductIds ?? []) {
    if (!GUID.test(id)) problems.push(`related product id "${id}" is not a valid product identifier`)
  }
  for (const kind of service.relatedProductKinds ?? []) {
    if (!PRODUCT_KINDS.includes(kind)) problems.push(`"${kind}" is not a valid product kind`)
  }

  for (const link of service.relatedHelpLinks ?? []) {
    const target = findDocument(link.group, link.slug)
    if (!target) {
      problems.push(`help link /${link.group}/${link.slug} does not exist`)
    } else if (!isPublishedDocument(target)) {
      problems.push(`help link /${link.group}/${link.slug} is draft`)
    }
  }

  for (const key of FACT_KEYS) {
    const fact = service.facts[key]
    if (!fact || fact.status !== 'published') continue
    problems.push(...factProblems(key, fact, today))
  }

  const publishedFaqs = service.faqs.filter((entry) => entry.status === 'published')
  const faqIds = service.faqs.map((entry) => entry.id)
  if (new Set(faqIds).size !== faqIds.length) problems.push('faq anchors must be unique')
  for (const entry of publishedFaqs) problems.push(...faqProblems(entry, today))

  // Prose scans. Facts are excluded from the claim scan (see `servicePublicText`) but included in
  // the placeholder and leak scans, where an approved value is no excuse.
  const proseValues = [
    service.name,
    service.shortName,
    service.description,
    service.cardSummary,
    service.hero.eyebrow,
    service.hero.headline,
    service.hero.summary,
    ...publishedSections.flatMap((section) => [section.heading, ...section.blocks.flatMap(blockText)]),
    ...publishedFaqs.flatMap((entry) => [entry.question, entry.answer]),
  ]

  const placeholders = findServicePlaceholders(servicePublicText(service))
  if (placeholders.length > 0) problems.push(`placeholder content present: ${placeholders.join(', ')}`)

  const claims = findUnsupportedClaims(proseValues)
  if (claims.length > 0) problems.push(...claims)

  const leaks = findLeaks(servicePublicText(service))
  if (leaks.length > 0) problems.push(`internal detail present: ${leaks.join(', ')}`)

  const publishable = problems.length === 0
  if (!publishable) return { publishable, ...EMPTY, problems }

  return {
    publishable,
    sections: publishedSections,
    facts: renderableFacts(service, today),
    faqs: publishedFaqs,
    problems,
  }
}
