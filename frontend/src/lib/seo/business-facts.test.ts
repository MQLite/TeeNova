import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isVerifiedProfileUrl, sameAsUrls, socialProfileLinks } from './social-profiles'

/**
 * Jira 10308 — approval-gated business facts, and the NAP/profile rules that decide whether they
 * may be published as machine-readable claims.
 *
 * The modules under test read most values at call time, but the *display* facts (address, hours)
 * are module-level constants, so the environment-override cases re-import through `vi.resetModules`.
 */

const APPROVAL_FLAGS = [
  'NEXT_PUBLIC_BUSINESS_IDENTITY_APPROVED',
  'NEXT_PUBLIC_BUSINESS_ADDRESS_APPROVED',
  'NEXT_PUBLIC_BUSINESS_HOURS_APPROVED',
  'NEXT_PUBLIC_PUBLIC_EMAIL_ROLE_APPROVED',
]

async function loadBusiness() {
  vi.resetModules()
  return import('@/lib/site-business')
}

beforeEach(() => {
  for (const flag of APPROVAL_FLAGS) vi.stubEnv(flag, '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('default (nothing approved) state', () => {
  it('publishes no name, address, hours, phone or email as a structured fact', async () => {
    const business = await loadBusiness()
    const facts = business.approvedBusinessFacts()
    expect(facts.name).toBeNull()
    expect(facts.legalName).toBeNull()
    expect(facts.address).toBeNull()
    expect(facts.openingHours).toBeNull()
    expect(facts.telephone).toBeNull()
    expect(facts.email).toBeNull()
    expect(facts.areaServed).toEqual([])
    expect(facts.priceRange).toBeNull()
    expect(facts.logoUrl).toBeNull()
  })

  it('is not eligible to publish a LocalBusiness node', async () => {
    const business = await loadBusiness()
    expect(business.localBusinessEligible()).toBe(false)
  })

  it('reports every open approval as a blocker rather than filling the gap', async () => {
    const business = await loadBusiness()
    const approvals = business.localBusinessBlockers().map((blocker) => blocker.approval)
    expect(approvals).toEqual(expect.arrayContaining(['A01/A02', 'A07', 'A09', 'A05']))
  })
})

describe('approval gates', () => {
  it('releases the name only with the identity flag, and never invents a legal name', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_IDENTITY_APPROVED', 'true')
    const business = await loadBusiness()
    const facts = business.approvedBusinessFacts()
    expect(facts.name).toBe('Otahuhu Printing Shop')
    // The registered entity is a separate, explicitly configured decision.
    expect(facts.legalName).toBeNull()
  })

  it('releases the legal name only when it is configured as well as approved', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_IDENTITY_APPROVED', 'true')
    vi.stubEnv('NEXT_PUBLIC_BRAND_LEGAL_NAME', 'Quality Canvas Ltd')
    const business = await loadBusiness()
    expect(business.approvedBusinessFacts().legalName).toBe('Quality Canvas Ltd')
  })

  it('releases the address and hours independently of the name', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_ADDRESS_APPROVED', 'true')
    const withAddress = await loadBusiness()
    expect(withAddress.approvedBusinessFacts().address?.streetAddress).toBe('483 Great South Road')
    expect(withAddress.approvedBusinessFacts().openingHours).toBeNull()
    // Address alone is still not enough for a node — the identity is the other half.
    expect(withAddress.localBusinessEligible()).toBe(false)

    vi.stubEnv('NEXT_PUBLIC_BUSINESS_HOURS_APPROVED', 'true')
    const withHours = await loadBusiness()
    expect(withHours.approvedBusinessFacts().openingHours).toHaveLength(2)
  })

  it('becomes eligible only once both the identity and the address are approved', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_IDENTITY_APPROVED', 'true')
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_ADDRESS_APPROVED', 'true')
    const business = await loadBusiness()
    expect(business.localBusinessEligible()).toBe(true)
  })
})

describe('email role', () => {
  it('publishes no email until a mailbox role is assigned', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONTACT_EMAIL', 'otahuhuprint@gmail.com')
    const business = await loadBusiness()
    expect(business.approvedBusinessFacts().email).toBeNull()
  })

  it('publishes a confirmed address once the role is assigned', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUBLIC_EMAIL_ROLE_APPROVED', 'true')
    vi.stubEnv('NEXT_PUBLIC_CONTACT_EMAIL', 'otahuhuprint@gmail.com')
    const business = await loadBusiness()
    expect(business.approvedBusinessFacts().email).toBe('otahuhuprint@gmail.com')
  })

  it('refuses an address that is not one of the two confirmed mailboxes', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUBLIC_EMAIL_ROLE_APPROVED', 'true')
    const business = await loadBusiness()
    // Including the recorded misspelling (approval A03), assembled the same way it is in source.
    for (const address of [
      ['quanlity', 'canvasltd@gmail.com'].join(''),
      'someone@example.com',
      '',
    ]) {
      vi.stubEnv('NEXT_PUBLIC_CONTACT_EMAIL', address)
      vi.resetModules()
      const reloaded = await import('@/lib/site-business')
      expect(reloaded.approvedBusinessFacts().email, address).not.toBe(address)
    }
  })

  it('recognises exactly the two confirmed addresses', async () => {
    const business = await loadBusiness()
    expect(business.isConfirmedBusinessEmail('otahuhuprint@gmail.com')).toBe(true)
    expect(business.isConfirmedBusinessEmail('qualitycanvasltd@gmail.com')).toBe(true)
    expect(business.isConfirmedBusinessEmail(business.KNOWN_INVALID_BUSINESS_EMAILS[0])).toBe(false)
    expect(business.isConfirmedBusinessEmail(null)).toBe(false)
  })
})

describe('NAP is generated from one source', () => {
  it('derives the visible single line from the same components the structured address uses', async () => {
    const business = await loadBusiness()
    const { shopAddress } = business
    expect(shopAddress.singleLine).toBe('483 Great South Road, Otahuhu, Auckland 1062')
    expect(shopAddress.singleLine).toContain(shopAddress.streetAddress)
    expect(shopAddress.singleLine).toContain(shopAddress.addressLocality)
    expect(shopAddress.singleLine).toContain(shopAddress.postalCode)
  })

  it('derives the visible hours sentence from the same rows the specification uses', async () => {
    const business = await loadBusiness()
    expect(business.openingHoursSentence).toBe('Mon–Fri 9am–5pm and Sat 10am–4pm')
    expect(business.openingHours.map((row) => row.opens)).toEqual(['09:00', '10:00'])
    expect(business.openingHours.map((row) => row.closes)).toEqual(['17:00', '16:00'])
    expect(business.openingHours[0].days).toContain('Monday')
    expect(business.openingHours[1].days).toEqual(['Saturday'])
  })

  it('follows configuration when the address is overridden', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_STREET_ADDRESS', '1 Example Street')
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_POSTAL_CODE', '1010')
    const business = await loadBusiness()
    expect(business.shopAddress.singleLine).toBe('1 Example Street, Otahuhu, Auckland 1010')
    expect(business.mapsSearchUrl).toContain(encodeURIComponent('1 Example Street'))
  })
})

describe('verified social profiles', () => {
  it('renders nothing when nothing is configured', () => {
    expect(socialProfileLinks()).toEqual([])
    expect(sameAsUrls()).toEqual([])
  })

  it('accepts a specific https profile on the platform’s own domain', () => {
    expect(isVerifiedProfileUrl('facebook', 'https://www.facebook.com/otahuhuprint')).toBe(true)
    expect(isVerifiedProfileUrl('instagram', 'https://instagram.com/otahuhuprint')).toBe(true)
    expect(isVerifiedProfileUrl('googleBusinessProfile', 'https://g.page/otahuhu-print')).toBe(true)
  })

  it('rejects a platform homepage, a placeholder, http, or the wrong host', () => {
    expect(isVerifiedProfileUrl('facebook', 'https://facebook.com')).toBe(false)
    expect(isVerifiedProfileUrl('facebook', 'https://www.facebook.com/')).toBe(false)
    expect(isVerifiedProfileUrl('facebook', '#')).toBe(false)
    expect(isVerifiedProfileUrl('facebook', '')).toBe(false)
    expect(isVerifiedProfileUrl('facebook', 'http://facebook.com/otahuhuprint')).toBe(false)
    expect(isVerifiedProfileUrl('instagram', 'https://facebook.com/otahuhuprint')).toBe(false)
    expect(isVerifiedProfileUrl('instagram', 'https://instagram.com.evil.test/x')).toBe(false)
    expect(isVerifiedProfileUrl('facebook', 'https://user:pw@facebook.com/x')).toBe(false)
  })

  it('drops an invalid value instead of rendering a broken link beside valid ones', () => {
    vi.stubEnv('NEXT_PUBLIC_FACEBOOK_URL', 'https://www.facebook.com/otahuhuprint')
    vi.stubEnv('NEXT_PUBLIC_INSTAGRAM_URL', '#')
    const links = socialProfileLinks()
    expect(links.map((link) => link.platform)).toEqual(['facebook'])
  })

  it('keeps the review link out of sameAs while keeping it available to the UI', () => {
    vi.stubEnv('NEXT_PUBLIC_FACEBOOK_URL', 'https://www.facebook.com/otahuhuprint')
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_REVIEW_URL', 'https://g.page/r/abc/review')
    expect(socialProfileLinks().map((link) => link.platform)).toEqual(['facebook', 'googleReview'])
    // sameAs means "another profile of this entity", not "a page of reviews about it".
    expect(sameAsUrls()).toEqual(['https://www.facebook.com/otahuhuprint'])
  })
})
