/**
 * Public brand naming (Jira 10307).
 *
 * The primary public identity is NOT settled. Jira 10300 records it as an open
 * approval (A34–A35): the business is variously "Otahuhu Print", "Otahuhu
 * Printing", "Otahuhu Printing Shop" and the registered "Quality Canvas Ltd",
 * and no one in this repository has the authority to choose between them.
 *
 * This module therefore does two things and no more:
 *
 *   1. Preserves exactly what the site renders today. `brandName` is the string
 *      the header and footer already showed; `brandFullName` is the longer form
 *      already used in the copyright line and metadata `siteName`. Nothing about
 *      the visible identity changes in this task.
 *
 *   2. Makes it a one-variable change once the owner decides, instead of a
 *      41-occurrence find-and-replace across pages, metadata and components.
 *
 * `brandLegalName` is deliberately unset by default. "Quality Canvas Ltd" is a
 * confirmed registered entity but has never appeared on the public site, and
 * making it customer-facing is a business decision, not a styling one.
 */

/** Short form. Header, footer and the brand mark. */
export const brandName = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || 'Otahuhu Printing'

/** Long form. Copyright line and metadata `siteName`. */
export const brandFullName =
  process.env.NEXT_PUBLIC_BRAND_FULL_NAME?.trim() || 'Otahuhu Printing Shop'

/**
 * Registered company name, rendered only if explicitly configured. Left unset so
 * the site cannot imply a customer-facing identity the owner has not confirmed.
 */
export const brandLegalName = process.env.NEXT_PUBLIC_BRAND_LEGAL_NAME?.trim() || null
