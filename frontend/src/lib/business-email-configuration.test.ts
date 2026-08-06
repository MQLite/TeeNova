import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import fg from 'fast-glob'

/**
 * Jira 10303 — business mailbox correctness.
 *
 * Two addresses are confirmed valid: otahuhuprint@gmail.com and qualitycanvasltd@gmail.com. The
 * earlier misspelling must be absent from source, and neither address may have a role hard-coded,
 * because which mailbox handles which role has not been decided.
 */

const VALID_ADDRESSES = ['otahuhuprint@gmail.com', 'qualitycanvasltd@gmail.com']
const INVALID_ADDRESS = ['quanlity', 'canvasltd@gmail.com'].join('')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const repoRoot = join(process.cwd(), '..')

const sourceFiles = () =>
  fg.sync(
    [
      'frontend/src/**/*.{ts,tsx}',
      'frontend/.env*.example',
      'backend/src/**/*.{cs,json}',
    ],
    { cwd: repoRoot, absolute: true, ignore: ['**/bin/**', '**/obj/**', '**/node_modules/**'] },
  )

describe('business mailbox spelling', () => {
  it('has no occurrence of the invalid address in source or tracked configuration examples', () => {
    const offenders = sourceFiles().filter((file) => readFileSync(file, 'utf8').includes(INVALID_ADDRESS))
    expect(offenders).toEqual([])
  })

  it('spells the fallback contact address correctly', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONTACT_EMAIL', '')
    const contact = await import('./site-contact')
    expect(contact.contactEmail).toBe('qualitycanvasltd@gmail.com')
    expect(VALID_ADDRESSES).toContain(contact.contactEmail)
  })
})

describe('mailbox roles remain configuration-driven', () => {
  it('supports either confirmed address as the public contact', async () => {
    for (const address of VALID_ADDRESSES) {
      vi.stubEnv('NEXT_PUBLIC_CONTACT_EMAIL', address)
      vi.resetModules()
      const contact = await import('./site-contact')
      expect(contact.contactEmail).toBe(address)
      expect(contact.emailHref).toBe(`mailto:${address}`)
    }
  })

  it('takes the privacy contact from its own configuration key', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONTACT_EMAIL', 'qualitycanvasltd@gmail.com')
    vi.stubEnv('NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL', 'otahuhuprint@gmail.com')
    const contact = await import('./site-contact')
    expect(contact.privacyContactEmail).toBe('otahuhuprint@gmail.com')
    expect(contact.privacyContactHref).toBe('mailto:otahuhuprint@gmail.com')
  })

  it('falls back to the general contact address rather than assigning a privacy mailbox', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONTACT_EMAIL', 'qualitycanvasltd@gmail.com')
    vi.stubEnv('NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL', '')
    const contact = await import('./site-contact')
    expect(contact.privacyContactEmail).toBe('qualitycanvasltd@gmail.com')
  })

  it('hard-codes no mailbox role in policy or help content', () => {
    const contentFiles = fg.sync('frontend/src/content/**/*.ts', { cwd: repoRoot, absolute: true })
    expect(contentFiles.length).toBeGreaterThan(0)
    for (const file of contentFiles) {
      const source = readFileSync(file, 'utf8')
      for (const address of VALID_ADDRESSES) expect(source).not.toContain(address)
    }
  })
})
