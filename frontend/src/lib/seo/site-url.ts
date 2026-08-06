/**
 * The one source of the public site origin (Jira 10308).
 *
 * Every absolute URL the site publishes — `metadataBase`, canonicals, Open Graph URLs, social-image
 * URLs, sitemap entries, the `Sitemap:` line in `robots.txt` and every JSON-LD `@id` and `url` —
 * resolves through here. Nothing else may decide what the site's public address is.
 *
 * Three addresses in this repository are deliberately NOT candidates:
 *
 *   • `NEXT_PUBLIC_API_BASE_URL` — the browser-facing *backend* address. It happens to be the same
 *     host in the current production deployment, which is exactly why reading it here would be a
 *     latent bug: the day the API moves to `api.` the canonicals would silently follow it.
 *   • `BACKEND_URL` — the server-only internal address (`http://localhost:5100`). Publishing that
 *     as a canonical would leak internal topology and point crawlers at an unroutable host.
 *   • The request `Host` header — spoofable, and behind nginx it is whatever the proxy forwards.
 *     A canonical authority derived from an attacker-controlled header is a canonical-injection
 *     vector, so the production origin is configuration, never request state.
 *
 * ## Failure behaviour
 *
 * In production an absent or invalid `NEXT_PUBLIC_SITE_URL` **fails closed**: `siteOrigin()`
 * returns `null`, every absolute-URL consumer omits its output (no canonical, no OG URL, no
 * JSON-LD node, an empty sitemap and a site-wide `Disallow: /`), and `reportSiteOriginReadiness()`
 * logs one loud error. It does not throw: a hard throw would turn a missing environment variable
 * into a total production outage of a working shop, and "no SEO output" is both safer and more
 * obvious than "wrong SEO output".
 *
 * Outside production the origin falls back to `http://localhost:3000` so local development and the
 * test suite have a stable, obviously-local origin. That fallback is unreachable from production
 * code: `localhost` is rejected outright when `NODE_ENV === 'production'`.
 *
 * ## Approval status
 *
 * The production domain is **not approved**. `https://www.otahuhuprint.com` appears in
 * `.env.production.local.example` as the *API* base address; Jira 10300 records the canonical
 * public domain as open approval **A44 (BLK)**. This module deliberately hard-codes no default, so
 * shipping without the approval produces no canonical rather than a guessed one.
 */

/** Why a candidate origin was rejected. Surfaced in readiness reporting and asserted in tests. */
export type SiteOriginFailure =
  | 'missing'
  | 'relative'
  | 'unparseable'
  | 'unsupported-protocol'
  | 'insecure-protocol'
  | 'credentials'
  | 'query'
  | 'fragment'
  | 'path'
  | 'no-host'
  | 'localhost-in-production'

export interface SiteOriginResult {
  /** Normalized `scheme://host[:port]`, never with a trailing slash. Null when unusable. */
  origin: string | null
  failure?: SiteOriginFailure
}

export interface ResolvedSiteOrigin extends SiteOriginResult {
  source: 'configured' | 'development-fallback' | 'unavailable'
  /** True when the running build is a production build. */
  production: boolean
}

/** Environment variable holding the public website origin. */
export const SITE_URL_ENV_VAR = 'NEXT_PUBLIC_SITE_URL'

/** Local-development origin. Never reachable from a production build. */
export const DEVELOPMENT_FALLBACK_ORIGIN = 'http://localhost:3000'

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'])

const isLocalHostname = (hostname: string): boolean =>
  LOCAL_HOSTNAMES.has(hostname.toLowerCase()) || hostname.toLowerCase().endsWith('.localhost')

/**
 * Validate and normalize a candidate public origin.
 *
 * Exported separately from `siteOrigin()` so the rules can be tested as pure input→output pairs
 * without reaching for environment mutation.
 */
export function normalizeSiteOrigin(
  raw: string | null | undefined,
  options: { allowInsecureLocalhost?: boolean; allowLocalhost?: boolean } = {},
): SiteOriginResult {
  const value = raw?.trim()
  if (!value) return { origin: null, failure: 'missing' }

  // A relative value can never be an origin. Caught before `new URL` so `/foo` reports the useful
  // failure rather than a generic parse error.
  if (value.startsWith('/')) return { origin: null, failure: 'relative' }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { origin: null, failure: 'unparseable' }
  }

  // `javascript:`, `data:`, `file:`, `mailto:` … anything that is not the web.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { origin: null, failure: 'unsupported-protocol' }
  }

  if (url.username !== '' || url.password !== '') {
    return { origin: null, failure: 'credentials' }
  }

  if (url.hostname === '') return { origin: null, failure: 'no-host' }

  const local = isLocalHostname(url.hostname)

  if (url.protocol === 'http:' && !(options.allowInsecureLocalhost && local)) {
    return { origin: null, failure: 'insecure-protocol' }
  }

  if (local && options.allowLocalhost === false) {
    return { origin: null, failure: 'localhost-in-production' }
  }

  if (url.search !== '') return { origin: null, failure: 'query' }
  if (url.hash !== '') return { origin: null, failure: 'fragment' }

  // A trailing slash is the only path `URL` will not have already normalized away, and it is the
  // one form we accept: an origin with a path prefix is a sub-application, not a site origin.
  if (url.pathname !== '/' && url.pathname !== '') {
    return { origin: null, failure: 'path' }
  }

  // `URL.origin` is already `scheme://host[:port]` with no trailing slash and the default port
  // elided, so `https://x.com/` and `https://x.com:443` both normalize to `https://x.com`.
  return { origin: url.origin }
}

/** True only when the running build is a production build. */
export const isProductionBuild = (): boolean => process.env.NODE_ENV === 'production'

/**
 * Resolve the public origin for the current environment.
 *
 * Read on every call rather than memoized at module load: `NEXT_PUBLIC_*` values are inlined at
 * build time in client bundles, but server modules read `process.env` live, and the tests need to
 * exercise production and development behaviour in one process.
 */
export function resolveSiteOrigin(): ResolvedSiteOrigin {
  const production = isProductionBuild()
  const configured = normalizeSiteOrigin(process.env[SITE_URL_ENV_VAR], {
    // Production requires HTTPS and refuses a local hostname outright, so a staging misconfiguration
    // cannot publish `http://localhost:3000` as the canonical authority of a live site.
    allowInsecureLocalhost: !production,
    allowLocalhost: production ? false : undefined,
  })

  if (configured.origin) return { ...configured, source: 'configured', production }

  if (!production) {
    return {
      origin: DEVELOPMENT_FALLBACK_ORIGIN,
      failure: configured.failure,
      source: 'development-fallback',
      production,
    }
  }

  return { origin: null, failure: configured.failure, source: 'unavailable', production }
}

/** The public origin, or `null` when production is misconfigured. Never throws. */
export const siteOrigin = (): string | null => resolveSiteOrigin().origin

/**
 * Absolute URL for a site-relative path, or `null` when no origin is available.
 *
 * Query strings and fragments are stripped: canonical and Open Graph URLs must not carry transient
 * filter, search or source parameters (Jira 10308 Phase 24).
 */
export function absoluteUrl(path: string): string | null {
  const origin = siteOrigin()
  if (!origin) return null
  return joinOrigin(origin, path)
}

/** Path → absolute URL against an explicit origin. Exported for builders that already hold one. */
export function joinOrigin(origin: string, path: string): string {
  const withoutQuery = path.split('#')[0].split('?')[0]
  if (withoutQuery === '' || withoutQuery === '/') return `${origin}/`
  const normalized = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`
  // No trailing slash on sub-paths: the app router serves `/services` and `/services/` as the same
  // page, and publishing both forms would be a self-inflicted duplicate.
  return `${origin}${normalized.replace(/\/+$/, '')}`
}

const READINESS_MESSAGES: Record<SiteOriginFailure, string> = {
  missing: 'the variable is unset or empty',
  relative: 'the value is a relative path, not an absolute origin',
  unparseable: 'the value is not a parseable URL',
  'unsupported-protocol': 'the value does not use http(s)',
  'insecure-protocol': 'the value is http:// — production canonicals must be https://',
  credentials: 'the value contains credentials',
  query: 'the value contains a query string',
  fragment: 'the value contains a fragment',
  path: 'the value contains a path — supply an origin only',
  'no-host': 'the value has no hostname',
  'localhost-in-production': 'the value is a local hostname and cannot be a production canonical',
}

/**
 * One-line readiness statement for logs and the evidence document.
 *
 * Deliberately contains no secret: the site origin is public by definition, and the variable name
 * is documented. Nothing else from the environment is read or printed.
 */
export function siteOriginReadiness(): { ready: boolean; message: string } {
  const resolved = resolveSiteOrigin()
  if (resolved.source === 'configured') {
    return { ready: true, message: `Public site origin: ${resolved.origin}` }
  }
  const reason = resolved.failure ? READINESS_MESSAGES[resolved.failure] : 'unknown reason'
  if (resolved.source === 'development-fallback') {
    return {
      ready: false,
      message: `${SITE_URL_ENV_VAR} not usable (${reason}); using the development origin ${DEVELOPMENT_FALLBACK_ORIGIN}. This fallback is refused in production.`,
    }
  }
  return {
    ready: false,
    message: `${SITE_URL_ENV_VAR} not usable (${reason}). Canonicals, Open Graph URLs, structured data and the sitemap are suppressed, and robots.txt disallows crawling, until it is set to the approved production origin.`,
  }
}
