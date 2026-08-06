import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Jira 10303 — the cart carried two inherited delivery claims that no implemented rule supports:
 * a NZ$100 free-shipping threshold (no shipping charge is calculated anywhere, so the order total
 * has always equalled the subtotal) and a nationwide shipping claim. Both were presentation only
 * and both are gone; cart, pricing and checkout behaviour are untouched.
 */

const cartSource = readFileSync(join(process.cwd(), 'src', 'app', 'cart', 'page.tsx'), 'utf8')

describe('cart delivery claims', () => {
  it('advertises no free-shipping threshold', () => {
    expect(cartSource).not.toMatch(/more for free shipping/i)
    expect(cartSource).not.toMatch(/subtotal >= 100/)
    expect(cartSource).not.toMatch(/subtotal < 100/)
  })

  it('advertises no delivery-coverage claim', () => {
    expect(cartSource).not.toMatch(/NZ[ -]wide|nationwide/i)
  })

  it('leaves the subtotal, total and checkout action untouched', () => {
    expect(cartSource).toContain('Proceed to Checkout')
    expect(cartSource).toContain('Pricing unavailable')
    expect(cartSource).toContain('Refreshing prices…')
    // The total still reads straight from the server-recalculated subtotal.
    expect(cartSource).toContain('const subtotal = recalcSubtotal')
  })
})
