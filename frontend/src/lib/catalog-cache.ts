/**
 * Public-catalogue read-cache policy (Jira 10304).
 *
 * Before 10304 every frontend read used `cache: 'no-store'`, so the product page re-paid full
 * backend latency on every view and every navigation between products. This module is the single
 * place where a catalogue read is allowed to be cached, and it states why each duration is safe.
 *
 * ── What may be cached ───────────────────────────────────────────────────────────────────────────
 *   • Public product detail          — anonymous, active-product-only (backend Jira 9808)
 *   • Global print-area definitions  — catalogue-wide configuration, not product data
 *   • Global print-size definitions  — catalogue-wide configuration, not product data
 *
 * ── What must never be cached ────────────────────────────────────────────────────────────────────
 *   • Pricing calculations (`/api/pricing/calculate`, `/api/pricing/calculate-batch`)
 *   • Checkout quotes, cart validation, stock-sensitive reads
 *   • Payment and order operations
 *   • Anything authenticated
 * These are POSTs or authenticated GETs and never pass a `ReadCacheOptions` argument, so they keep
 * the client's `no-store` default. Backend pricing remains the sole pricing authority; a cached
 * catalogue response is only ever used for *display* and for the option lists a customer picks from,
 * never as a price the customer is charged.
 *
 * ── Where the cache lives ────────────────────────────────────────────────────────────────────────
 * The Next.js **server** Data Cache only (`next.revalidate`). Browser-side calls keep `no-store`
 * (see `readCacheInit` in `lib/api-client.ts`), so a customer's device never replays stale catalogue
 * data, and no `Cache-Control` header or CDN behaviour is changed by this task.
 *
 * ── How quickly an Admin catalogue edit becomes visible ──────────────────────────────────────────
 * Worst case = the revalidation window below (product edits ≤ 60 s, print-config edits ≤ 300 s).
 * Next.js serves the stale entry to the request that crosses the boundary and refreshes in the
 * background, so the *following* request sees the new data. Admin pages themselves are unaffected —
 * they read through the authenticated admin client, which never passes these options.
 *
 * ── Invalidation on deployment ───────────────────────────────────────────────────────────────────
 * The Data Cache is keyed by build id. A new deployment (`next build` + restart) starts with an
 * empty cache, so a release always serves fresh catalogue data. There is no manual purge step.
 *
 * ── Tuning ───────────────────────────────────────────────────────────────────────────────────────
 * `CATALOG_REVALIDATE_SECONDS` / `PRINT_CONFIG_REVALIDATE_SECONDS` (server-only env vars, optional)
 * override the defaults. Set either to `0` to disable caching for that read without a code change.
 */

/** Parses a positive-integer seconds env override; falls back when unset or malformed. */
function readSeconds(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) return fallback
  return parsed
}

/**
 * Product detail: 60 s.
 *
 * Safe because the payload is public, anonymous, active-only data whose only mutation path is an
 * Admin edit — a low-frequency, human-paced action. A price shown from a ≤ 60 s old catalogue read
 * is a *display* price only; the authoritative quote is recalculated live and again at checkout, so
 * a stale display value can never become a charged value.
 */
export const PRODUCT_DETAIL_REVALIDATE_SECONDS = readSeconds(
  process.env.CATALOG_REVALIDATE_SECONDS,
  60,
)

/**
 * Global print areas / print sizes: 300 s.
 *
 * These are catalogue-wide configuration rows shared by every product and are changed far less often
 * than products. They control which options are *offered*; a newly added option appearing up to five
 * minutes late is a display lag, and a removed option is still rejected by the backend on quote and
 * at checkout, so a stale list cannot produce an invalid order.
 */
export const PRINT_CONFIG_REVALIDATE_SECONDS = readSeconds(
  process.env.PRINT_CONFIG_REVALIDATE_SECONDS,
  300,
)
