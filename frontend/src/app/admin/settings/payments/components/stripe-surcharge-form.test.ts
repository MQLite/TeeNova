import { describe, expect, it } from 'vitest'
import {
  buildSurchargePayload,
  formatBasisPoints,
  parseFixedAmount,
  parsePercentageToBasisPoints,
  validateSurchargeForm,
  type StripeSurchargeFormValue,
} from './stripe-surcharge-form'

const valid: StripeSurchargeFormValue = {
  enabled: false,
  percentage: '2.65',
  fixedAmount: '0.30',
  disclosureText: ' A card processing surcharge applies. ',
  calculationVersion: 'stripe-gross-up-v1',
}

describe('Stripe surcharge form conversion', () => {
  it.each([[265, '2.65'], [0, '0.00'], [9999, '99.99']])('formats %i basis points as %s', (bps, display) => {
    expect(formatBasisPoints(bps)).toBe(display)
  })

  it.each([['2.65', 265], ['0', 0], ['0.30', 30], ['99.99', 9999]])('parses %s deterministically', (display, bps) => {
    expect(parsePercentageToBasisPoints(display)).toBe(bps)
  })

  it.each(['2.651', '-1', '100', '100.01', '1e2', 'abc', '', '2,65'])('rejects invalid percentage %s', (display) => {
    expect(parsePercentageToBasisPoints(display)).toBeNull()
  })

  it.each([['0.00', 0], ['0.30', 0.3], ['1.25', 1.25]])('parses fixed fee %s', (display, amount) => {
    expect(parseFixedAmount(display)).toBe(amount)
  })

  it.each(['-0.01', '0.001', '1e2', 'abc', ''])('rejects invalid fixed fee %s', (display) => {
    expect(parseFixedAmount(display)).toBeNull()
  })

  it('builds all five fields and trims only disclosure boundaries', () => {
    expect(buildSurchargePayload(valid)).toEqual({
      surchargeEnabled: false,
      surchargePercentageBasisPoints: 265,
      surchargeFixedAmount: 0.3,
      surchargeDisclosureText: 'A card processing surcharge applies.',
      surchargeCalculationVersion: 'stripe-gross-up-v1',
    })
  })

  it('validates blank and overlong disclosures', () => {
    expect(validateSurchargeForm({ ...valid, disclosureText: '  ' }).disclosureText).toMatch(/Enter/)
    expect(validateSurchargeForm({ ...valid, disclosureText: 'x'.repeat(501) }).disclosureText).toMatch(/500/)
  })
})
