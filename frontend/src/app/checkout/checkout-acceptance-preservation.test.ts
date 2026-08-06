import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { publishedDocuments } from '@/lib/public-content/registry'

/**
 * Jira 10303 — checkout acceptance behaviour must be unchanged.
 *
 * Phase 0 established the baseline: checkout asks the customer to accept nothing. There is no
 * acceptance statement, no terms link and no acceptance checkbox anywhere in the flow. This task
 * adds none, so these assertions pin the baseline rather than describe new behaviour.
 */

const checkoutSource = (file: string) =>
  readFileSync(join(process.cwd(), 'src', 'app', 'checkout', file), 'utf8')

const CHECKOUT_FILES = ['page.tsx', 'success/page.tsx', 'cancel/page.tsx']

describe('checkout acceptance behaviour', () => {
  it('still asks the customer to accept nothing', () => {
    for (const file of CHECKOUT_FILES) {
      const source = checkoutSource(file)
      expect(source).not.toMatch(/by (placing|continuing|submitting|proceeding)/i)
      expect(source).not.toMatch(/i (agree|accept)\b/i)
      expect(source).not.toMatch(/terms and conditions|terms of service/i)
    }
  })

  it('adds no acceptance checkbox', () => {
    for (const file of CHECKOUT_FILES) {
      const source = checkoutSource(file)
      expect(source).not.toMatch(/type=["']checkbox["']/)
      expect(source).not.toMatch(/acceptedTerms|agreeToTerms|termsAccepted/)
    }
  })

  it('links to no policy page from checkout', () => {
    for (const file of CHECKOUT_FILES) {
      const source = checkoutSource(file)
      expect(source).not.toMatch(/\/policies\//)
      expect(source).not.toMatch(/\/help\//)
    }
  })

  it('would have nothing approved to link to even if a link were wanted', () => {
    // Every policy document is draft, so linking one from checkout would be a dead link by design.
    expect(publishedDocuments('policies')).toEqual([])
  })
})

describe('commerce copy left alone', () => {
  it('keeps the payment method, delivery and deposit wording exactly as it was', () => {
    const source = checkoutSource('page.tsx')
    expect(source).toContain('Pickup orders require a deposit before processing.')
    expect(source).toContain('Shipping orders require full payment before processing.')
    expect(source).toContain('Place the order now and arrange payment with the shop.')
    expect(source).toContain('Collect your order from our shop. Deposit required.')
  })
})
