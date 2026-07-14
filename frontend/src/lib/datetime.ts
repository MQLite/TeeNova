// ── NZ date/time formatting ─────────────────────────────────────────────────────
//
// Backend timestamps are UTC. Depending on the serializer they may or may not carry
// an explicit timezone marker ("Z" or "+hh:mm"). A bare value like "2026-07-13T10:30:00"
// is interpreted by `new Date()` as the browser's LOCAL time, which silently shifts
// the value by the browser's offset. To render correct New Zealand wall-clock time
// everywhere (regardless of where the admin's browser is), we:
//   1. treat a naive (no-offset) timestamp as UTC, and
//   2. always format in the Pacific/Auckland timezone.

const NZ_TIME_ZONE = 'Pacific/Auckland'
const NZ_LOCALE = 'en-NZ'

/** True when the ISO string already carries a timezone (trailing Z or ±hh:mm offset). */
function hasTimeZone(iso: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso.trim())
}

/** Parse a backend timestamp, treating a naive (offset-less) value as UTC. */
export function parseBackendDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const normalized = hasTimeZone(iso) ? iso : `${iso}Z`
  const date = new Date(normalized)
  return isNaN(date.getTime()) ? null : date
}

/** Format a backend timestamp as NZ date + time (e.g. "13 Jul 2026, 10:30 pm"). */
export function formatNzDateTime(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  const date = parseBackendDate(iso)
  if (!date) return '—'
  return date.toLocaleString(NZ_LOCALE, { timeZone: NZ_TIME_ZONE, ...options })
}

/** Format a backend timestamp as an NZ date only (no time component). */
export function formatNzDate(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const date = parseBackendDate(iso)
  if (!date) return '—'
  return date.toLocaleDateString(NZ_LOCALE, { timeZone: NZ_TIME_ZONE, ...options })
}
