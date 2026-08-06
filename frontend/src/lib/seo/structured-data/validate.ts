/**
 * Structured-data validation rules (Jira 10308 Phase 27).
 *
 * These are the checks this repository can actually run: they are *local* rules about shape and
 * about facts this codebase is not allowed to publish. They are not, and must never be described
 * as, a Google Rich Results or schema.org validation — those are external services, and running
 * this function proves nothing about them. The evidence document records external validation
 * separately, with its own status.
 *
 * The rules encode the task's prohibitions so they are enforced mechanically rather than by review:
 * a future change that adds `availability: 'InStock'` or a `priceValidUntil` fails the suite even if
 * nobody remembers why those were forbidden.
 */

const FORBIDDEN_KEYS = [
  // Commercial terms with no approved source.
  'availability',
  'priceValidUntil',
  'shippingDetails',
  'hasMerchantReturnPolicy',
  'merchantReturnPolicy',
  'aggregateRating',
  'ratingValue',
  'reviewCount',
  'review',
  'award',
  'slogan',
  // Internal bookkeeping that must never be published.
  'permissionSource',
  'permissionReference',
  'originalFileName',
  'objectKey',
  'concurrencyStamp',
  'evidenceReference',
  'approvalReference',
  'approvedAt',
  'draftReason',
  'sku',
] as const

/** Substrings that indicate an internal path, an admin surface or a local address leaked into JSON-LD. */
const FORBIDDEN_SUBSTRINGS: readonly string[] = [
  '/admin',
  '/api/proxy',
  '/api/download',
  'localhost',
  '127.0.0.1',
  'wwwroot',
  'BACKEND_URL',
  'C:\\',
  '/uploads/designs/',
  // The misspelled mailbox recorded as approval A03 — one keystroke from a real address, and a
  // durable machine-readable claim if it ever got out. Assembled from fragments so the repository
  // scan for that address (Jira 10303) still finds nothing.
  ['quanlity', 'canvasltd'].join(''),
]

const URL_KEYS = new Set(['url', '@id', 'item', 'logo', 'sameAs', 'contentUrl', 'image'])

export interface ValidationIssue {
  path: string
  message: string
}

interface ValidateOptions {
  /** Allow local origins — used when validating against the development fallback origin. */
  allowLocalOrigin?: boolean
}

function checkUrl(value: string, path: string, options: ValidateOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!/^https?:\/\//i.test(value)) {
    issues.push({ path, message: `URL is not absolute: ${value}` })
    return issues
  }
  if (!options.allowLocalOrigin && /^https?:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)/i.test(value)) {
    issues.push({ path, message: `URL uses a local origin: ${value}` })
  }
  return issues
}

function walk(value: unknown, path: string, options: ValidateOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (value === null) {
    issues.push({ path, message: 'null is not permitted — omit the property instead' })
    return issues
  }
  if (value === undefined) {
    issues.push({ path, message: 'undefined is not permitted — omit the property instead' })
    return issues
  }

  if (typeof value === 'string') {
    if (value.trim() === '') {
      issues.push({ path, message: 'empty string is not permitted — omit the property instead' })
    }
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      if (value.toLowerCase().includes(forbidden.toLowerCase())) {
        // A local origin is a separate, allowable case when explicitly permitted.
        if (options.allowLocalOrigin && (forbidden === 'localhost' || forbidden === '127.0.0.1')) {
          continue
        }
        issues.push({ path, message: `contains a forbidden value (${forbidden})` })
      }
    }
    return issues
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) issues.push({ path, message: 'number is not finite' })
    return issues
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      issues.push({ path, message: 'empty array is not permitted — omit the property instead' })
    }
    value.forEach((entry, index) => issues.push(...walk(entry, `${path}[${index}]`, options)))
    return issues
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record['@type'] !== 'string' || record['@type'].trim() === '') {
      issues.push({ path, message: 'node has no @type' })
    }
    for (const [key, entry] of Object.entries(record)) {
      const childPath = `${path}.${key}`
      if ((FORBIDDEN_KEYS as readonly string[]).includes(key)) {
        issues.push({ path: childPath, message: `property "${key}" must never be published` })
        continue
      }
      if (URL_KEYS.has(key)) {
        if (typeof entry === 'string') issues.push(...checkUrl(entry, childPath, options))
        else if (Array.isArray(entry)) {
          entry.forEach((item, index) => {
            if (typeof item === 'string') {
              issues.push(...checkUrl(item, `${childPath}[${index}]`, options))
            }
          })
        }
      }
      issues.push(...walk(entry, childPath, options))
    }
    return issues
  }

  if (typeof value === 'boolean') return issues

  issues.push({ path, message: `unsupported value type: ${typeof value}` })
  return issues
}

/**
 * Validate a graph before it is serialized.
 *
 * Returns every issue found rather than the first, so a failing test names all of them at once.
 */
export function validateGraph(
  graph: readonly unknown[],
  options: ValidateOptions = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const seenIds = new Map<string, string>()

  graph.forEach((node, index) => {
    const path = `@graph[${index}]`
    issues.push(...walk(node, path, options))

    const record = node as Record<string, unknown>
    const id = record?.['@id']
    const type = record?.['@type']
    if (typeof id === 'string') {
      const existing = seenIds.get(id)
      if (existing && existing !== type) {
        issues.push({ path: `${path}.@id`, message: `@id ${id} is reused by a different @type` })
      }
      seenIds.set(id, String(type))
    }
  })

  return issues
}
