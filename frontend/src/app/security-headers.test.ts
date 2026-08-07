import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('production security headers', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8')

  it('removes the framework disclosure header', () => {
    expect(config).toMatch(/poweredByHeader:\s*false/)
  })

  it.each([
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Cross-Origin-Opener-Policy',
  ])('configures %s for every route', (header) => {
    expect(config).toContain("source: '/:path*'")
    expect(config).toContain(`key: '${header}'`)
  })
})
