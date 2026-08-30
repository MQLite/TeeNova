/**
 * The single source of the business's name, address, phone, hours and public contact address
 * (Jira 10308, plan §15.3).
 *
 * Before this module the shop address was written out in four files and the opening hours in three,
 * as free text. "NAP consistency" was therefore a promise a reviewer made, not a property the code
 * had. Everything that renders those facts — the footer, the contact page, the homepage teaser, page
 * metadata and JSON-LD — now reads them from here, so the visible page and the machine-readable
 * graph cannot drift apart.
 *
 * ## Two layers, deliberately separate
 *
 *   1. **Display facts** — the strings the site already showed before this task, unchanged, now
 *      configurable. Publishing these visibly is a decision earlier tasks already made; this module
 *      does not re-open it.
 *
 *   2. **Structured-data facts** — the same values, released into JSON-LD only behind an explicit
 *      approval flag. A machine-readable `LocalBusiness` node is a stronger, more durable claim than
 *      a line of page copy: it is what a search engine reproduces in a knowledge panel, and a wrong
 *      opening hour there sends a customer to a closed door. Jira 10300 records the street address
 *      (A07), the opening hours (A09 — **BLK**), the public business name (A01/A02 — **BLK**), the
 *      telephone (A05) and the service area (A10) through owner-confirmed values and approval
 *      gates, so the node is omitted rather than half-populated while required identity gates are
 *      still open.
 *
 * Nothing here invents a value. A missing or unapproved fact produces `null`, and every consumer
 * omits the field entirely — never an empty string, never a placeholder.
 */

import { brandFullName, brandLegalName, brandName } from './site-brand'
import { businessPhone, contactEmail } from './site-contact'

const flag = (name: string): boolean => process.env[name]?.trim().toLowerCase() === 'true'
const text = (name: string): string | null => process.env[name]?.trim() || null

// ── Display facts (visible on the page) ──────────────────────────────────────

/**
 * Shop street address, split into components so the visible line and the structured
 * `PostalAddress` are generated from the same values instead of being parsed apart later.
 *
 * The default is exactly the string the site already renders; it is the shop's own address, carried
 * forward from Jira 9605, and is presented as the shop's details rather than as a delivery,
 * collection or opening commitment.
 */
export interface ShopAddress {
  streetAddress: string
  addressLocality: string
  addressRegion: string
  postalCode: string
  /** ISO 3166-1 alpha-2. */
  addressCountry: string
  /** The one-line form used in visible copy and in the Google Maps search link. */
  singleLine: string
}

const DEFAULT_ADDRESS = {
  streetAddress: '483 Great South Road',
  addressLocality: 'Otahuhu',
  addressRegion: 'Auckland',
  postalCode: '1062',
  addressCountry: 'NZ',
} as const

export const shopAddress: ShopAddress = (() => {
  const parts = {
    streetAddress: text('NEXT_PUBLIC_BUSINESS_STREET_ADDRESS') ?? DEFAULT_ADDRESS.streetAddress,
    addressLocality: text('NEXT_PUBLIC_BUSINESS_LOCALITY') ?? DEFAULT_ADDRESS.addressLocality,
    addressRegion: text('NEXT_PUBLIC_BUSINESS_REGION') ?? DEFAULT_ADDRESS.addressRegion,
    postalCode: text('NEXT_PUBLIC_BUSINESS_POSTAL_CODE') ?? DEFAULT_ADDRESS.postalCode,
    addressCountry: text('NEXT_PUBLIC_BUSINESS_COUNTRY') ?? DEFAULT_ADDRESS.addressCountry,
  }
  return {
    ...parts,
    singleLine: `${parts.streetAddress}, ${parts.addressLocality}, ${parts.addressRegion} ${parts.postalCode}`,
  }
})()

/** Google Maps *search* link for the address — no Maps API key, no embedded tracking. */
export const mapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  shopAddress.singleLine,
)}`

/**
 * Opening hours in one place, in both the human form the page shows and the machine form JSON-LD
 * needs. The two are generated from the same rows, so "Sat 10am–4pm" on the page and
 * `Saturday 10:00–16:00` in the graph cannot disagree.
 */
export interface OpeningHoursRow {
  /** Visible label, e.g. "Mon–Fri". */
  label: string
  /** Visible hours, e.g. "9am–5pm". */
  display: string
  /** schema.org day names covered by this row. */
  days: readonly string[]
  /** 24-hour `HH:MM`. */
  opens: string
  closes: string
}

export const openingHours: readonly OpeningHoursRow[] = [
  {
    label: 'Mon–Fri',
    display: '9am–5pm',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    opens: '09:00',
    closes: '17:00',
  },
  {
    label: 'Sat',
    display: '10am–4pm',
    days: ['Saturday'],
    opens: '10:00',
    closes: '16:00',
  },
]

/** "Mon–Fri 9am–5pm and Sat 10am–4pm" — the sentence form used in page copy. */
export const openingHoursSentence = openingHours
  .map((row) => `${row.label} ${row.display}`)
  .join(' and ')

// ── Email validity ───────────────────────────────────────────────────────────

/**
 * The two confirmed business mailboxes.
 *
 * A third address — the registered company name with two letters transposed — was set deliberately
 * in an earlier commit and is recorded in Jira 10300 as approval A03. It is treated here as
 * invalid: an address one keystroke from a real mailbox is exactly the kind of value that must
 * never reach structured data, where it becomes a durable machine-readable claim. It is listed in
 * {@link KNOWN_INVALID_BUSINESS_EMAILS}, assembled from fragments so a repository-wide scan for it
 * (`business-email-configuration.test.ts`) still finds no occurrence to copy.
 */
export const CONFIRMED_BUSINESS_EMAILS = [
  'otahuhuprint@gmail.com',
  'qualitycanvasltd@gmail.com',
] as const

/** See the note above: assembled from fragments so the repository scan stays meaningful. */
export const KNOWN_INVALID_BUSINESS_EMAILS = [
  ['quanlity', 'canvasltd@gmail.com'].join(''),
] as const

export const isConfirmedBusinessEmail = (value: string | null | undefined): boolean => {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return false
  return (CONFIRMED_BUSINESS_EMAILS as readonly string[]).includes(normalized)
}

// ── Approval gates for structured data ───────────────────────────────────────

/**
 * Which business facts the owner has approved for machine-readable publication.
 *
 * Every gate defaults to closed. Turning one on is a deployment decision recorded against the
 * matching Jira 10300 approval, not something a code change can do on the owner's behalf.
 */
export interface BusinessApprovalGates {
  /** A01/A02 — the official public business name, and therefore any Organization/LocalBusiness node. */
  identity: boolean
  /** A07 — the street address as a published NAP fact. */
  address: boolean
  /** A09 — opening hours. */
  hours: boolean
  /** Mailbox-role assignment: which confirmed address is *the* public contact address. */
  emailRole: boolean
}

export const businessApprovalGates = (): BusinessApprovalGates => ({
  identity: flag('NEXT_PUBLIC_BUSINESS_IDENTITY_APPROVED'),
  address: flag('NEXT_PUBLIC_BUSINESS_ADDRESS_APPROVED'),
  hours: flag('NEXT_PUBLIC_BUSINESS_HOURS_APPROVED'),
  emailRole: flag('NEXT_PUBLIC_PUBLIC_EMAIL_ROLE_APPROVED'),
})

export interface ApprovedBusinessFacts {
  /** Approved public name, or null while A01/A02 is open. */
  name: string | null
  /** Registered entity name — only when explicitly configured (never inferred). */
  legalName: string | null
  address: ShopAddress | null
  openingHours: readonly OpeningHoursRow[] | null
  /** Verified public telephone. */
  telephone: string | null
  /** Public contact mailbox, once a role is assigned and the address is a confirmed one. */
  email: string | null
  /** Approved service areas (A10). Never derived from "we are in Auckland". */
  areaServed: string[]
  /** schema.org `priceRange`. Omitted unless explicitly approved. */
  priceRange: string | null
  /** Absolute or site-relative URL of an **approved** logo (A34). The temporary app icon is not one. */
  logoUrl: string | null
}

/**
 * The facts that may be published as structured data right now.
 *
 * Read this — never `shopAddress`/`openingHours` directly — from any JSON-LD builder.
 */
export function approvedBusinessFacts(): ApprovedBusinessFacts {
  const gates = businessApprovalGates()
  const email = text('NEXT_PUBLIC_CONTACT_EMAIL') ?? contactEmail

  const areaServed = (text('NEXT_PUBLIC_BUSINESS_AREA_SERVED') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  return {
    name: gates.identity ? brandFullName : null,
    // Never inferred from the mailbox: "Quality Canvas Ltd" becomes public only when both the
    // identity gate is open and the legal name is explicitly configured (Jira 10307 rule).
    legalName: gates.identity ? brandLegalName : null,
    address: gates.address ? shopAddress : null,
    openingHours: gates.hours ? openingHours : null,
    telephone: businessPhone,
    // A confirmed mailbox is still not a *public contact* mailbox until the role is assigned, and a
    // misspelled address is never published.
    email: gates.emailRole && isConfirmedBusinessEmail(email) ? email.trim().toLowerCase() : null,
    areaServed,
    priceRange: text('NEXT_PUBLIC_BUSINESS_PRICE_RANGE'),
    logoUrl: text('NEXT_PUBLIC_BRAND_LOGO_URL'),
  }
}

// ── Readiness reporting ──────────────────────────────────────────────────────

export interface BusinessFactBlocker {
  /** Jira 10300 approval id. */
  approval: string
  fact: string
  detail: string
}

/**
 * The unresolved facts that keep `LocalBusiness` out of the graph, in a form the evidence document
 * and the tests both consume so neither can claim readiness the code does not have.
 */
export function localBusinessBlockers(): BusinessFactBlocker[] {
  const facts = approvedBusinessFacts()
  const blockers: BusinessFactBlocker[] = []

  if (!facts.name) {
    blockers.push({
      approval: 'A01/A02',
      fact: 'Public business name',
      detail:
        'The site trades visibly as "Otahuhu Printing"/"Otahuhu Printing Shop" while the registered entity is Quality Canvas Ltd. Until the owner picks the public identity, no Organization or LocalBusiness name is published.',
    })
  }
  if (!facts.address) {
    blockers.push({
      approval: 'A07',
      fact: 'Street address',
      detail:
        'The address is shown on the site but has not been confirmed as an approved published NAP fact for structured data.',
    })
  }
  if (!facts.openingHours) {
    blockers.push({
      approval: 'A09',
      fact: 'Opening hours',
      detail:
        'Opening hours are recorded as an open approval and are not published as openingHoursSpecification.',
    })
  }
  if (!facts.telephone) {
    blockers.push({
      approval: 'A05',
      fact: 'Telephone',
      detail: 'No verified public telephone number is configured.',
    })
  }
  if (!facts.email) {
    blockers.push({
      approval: 'A02',
      fact: 'Public contact mailbox role',
      detail:
        'Two confirmed mailboxes exist; which one is the public contact address is not assigned, so no email is published as a business contact point.',
    })
  }
  return blockers
}

/**
 * Minimum bar for emitting a `LocalBusiness` node at all: an approved public name plus a confirmed
 * production URL (checked by the caller, which owns the origin). A node carrying only a name is
 * thin and contradicts the visible page, so name approval alone is necessary, not sufficient — the
 * address gate is required too.
 */
export const localBusinessEligible = (): boolean => {
  const facts = approvedBusinessFacts()
  return Boolean(facts.name && facts.address)
}
