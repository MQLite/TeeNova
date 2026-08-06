/**
 * Verified social and profile links (Jira 10308, approvals A27/A28/A39/A40).
 *
 * One configuration source feeds both the visible footer links and JSON-LD `sameAs`, so the two can
 * never disagree — a profile that is good enough to declare to a search engine is good enough to
 * show a customer, and vice versa.
 *
 * Nothing is guessed. The site does not derive `facebook.com/otahuhuprinting` from the business
 * name, and it does not scrape. An unset or invalid value renders **nothing at all**: no chip, no
 * inert `<span>` styled like a link, no `href="#"`. Before this task the footer carried the text
 * "Find us on Facebook and Instagram" with no link behind it; that is now driven by whether a
 * verified URL exists.
 *
 * Every value is checked against the platform's own host list, so a typo or a pasted tracking link
 * cannot become a machine-readable claim about who the business is.
 */

export type SocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'googleBusinessProfile'
  | 'googleReview'
  | 'linkedin'
  | 'youtube'

interface PlatformRule {
  label: string
  envVar: string
  /** Exact hostnames accepted (lower-cased, `www.` stripped before comparison). */
  hosts: readonly string[]
  /** True when the URL identifies a specific profile rather than the platform's front door. */
  requiresProfilePath: boolean
}

const PLATFORMS: Record<SocialPlatform, PlatformRule> = {
  facebook: {
    label: 'Facebook',
    envVar: 'NEXT_PUBLIC_FACEBOOK_URL',
    hosts: ['facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.com'],
    requiresProfilePath: true,
  },
  instagram: {
    label: 'Instagram',
    envVar: 'NEXT_PUBLIC_INSTAGRAM_URL',
    hosts: ['instagram.com'],
    requiresProfilePath: true,
  },
  googleBusinessProfile: {
    label: 'Google Business Profile',
    envVar: 'NEXT_PUBLIC_GOOGLE_BUSINESS_PROFILE_URL',
    // A Business Profile is shared either as a Maps place URL or a `g.page` short link.
    hosts: ['g.page', 'maps.app.goo.gl', 'goo.gl', 'google.com', 'maps.google.com'],
    requiresProfilePath: true,
  },
  googleReview: {
    label: 'Google reviews',
    envVar: 'NEXT_PUBLIC_GOOGLE_REVIEW_URL',
    hosts: ['g.page', 'search.google.com', 'google.com', 'maps.app.goo.gl'],
    requiresProfilePath: true,
  },
  linkedin: {
    label: 'LinkedIn',
    envVar: 'NEXT_PUBLIC_LINKEDIN_URL',
    hosts: ['linkedin.com'],
    requiresProfilePath: true,
  },
  youtube: {
    label: 'YouTube',
    envVar: 'NEXT_PUBLIC_YOUTUBE_URL',
    hosts: ['youtube.com', 'youtu.be'],
    requiresProfilePath: true,
  },
}

export interface SocialProfileLink {
  platform: SocialPlatform
  label: string
  url: string
}

const stripWww = (hostname: string): string => hostname.toLowerCase().replace(/^www\./, '')

/**
 * True when `value` is a usable, specific, HTTPS profile URL for `platform`.
 *
 * Rejects: empty strings, `#`, relative paths, `http://`, credentials, a host outside the
 * platform's own domains, and the platform's bare homepage.
 */
export function isVerifiedProfileUrl(platform: SocialPlatform, value: string | undefined | null): boolean {
  const rule = PLATFORMS[platform]
  const raw = value?.trim()
  if (!raw || raw === '#') return false

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }

  if (url.protocol !== 'https:') return false
  if (url.username !== '' || url.password !== '') return false
  if (!rule.hosts.includes(stripWww(url.hostname))) return false

  if (rule.requiresProfilePath) {
    const path = url.pathname.replace(/\/+$/, '')
    // "/" or "" is the platform homepage — it identifies no business.
    if (path === '' || path === '/') return false
  }

  return true
}

/** Configured, verified profile links in a stable order. Missing or invalid values are dropped. */
export function socialProfileLinks(): SocialProfileLink[] {
  return (Object.keys(PLATFORMS) as SocialPlatform[])
    .map((platform) => {
      const rule = PLATFORMS[platform]
      const value = process.env[rule.envVar]
      if (!isVerifiedProfileUrl(platform, value)) return null
      return { platform, label: rule.label, url: new URL(value!.trim()).toString() }
    })
    .filter((link): link is SocialProfileLink => link !== null)
}

/**
 * `sameAs` values for structured data.
 *
 * The Google review URL is excluded: it is a link to *reviews of* the business, not another profile
 * *of* the business, and listing it as `sameAs` would misstate the relationship. It is still
 * available to visible UI through {@link socialProfileLinks}.
 */
export function sameAsUrls(): string[] {
  return socialProfileLinks()
    .filter((link) => link.platform !== 'googleReview')
    .map((link) => link.url)
}

/** The platform list, for documentation and tests. */
export const socialPlatformEnvVars = (): { platform: SocialPlatform; envVar: string }[] =>
  (Object.keys(PLATFORMS) as SocialPlatform[]).map((platform) => ({
    platform,
    envVar: PLATFORMS[platform].envVar,
  }))
