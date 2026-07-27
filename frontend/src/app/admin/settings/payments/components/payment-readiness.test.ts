import { describe, expect, it } from 'vitest'
import { paymentSettingsSaveError, readinessMessage, surchargeReadinessMessage } from './payment-readiness'

const cases = [
  ['SurchargeRateInvalid', 'The surcharge percentage is invalid.'],
  ['SurchargeFixedAmountInvalid', 'The fixed surcharge amount is invalid.'],
  ['SurchargeDisclosureMissing', 'Enter a customer disclosure message.'],
  ['SurchargeDisclosureInvalid', 'The disclosure message is invalid.'],
  ['SurchargeCalculationVersionUnsupported', 'The surcharge calculation version is unsupported.'],
  ['SurchargeCurrencyInvalid', 'Card surcharge is only supported for NZD.'],
] as const

describe('payment readiness presentation', () => {
  it.each(cases)('maps %s to safe copy', (code, message) => {
    expect(readinessMessage(code)).toBe(message)
    expect(surchargeReadinessMessage(code, true)).toBe(message)
  })

  it('adds no false surcharge warning when disabled', () => {
    expect(surchargeReadinessMessage('SurchargeRateInvalid', false)).toBeNull()
  })

  it('preserves existing non-surcharge readiness information', () => {
    expect(readinessMessage('MissingSecretKey')).toBe('MissingSecretKey')
  })

  it('maps incomplete atomic configuration save errors', () => {
    const error = { details: { error: { code: 'TeeNova:Payment:SurchargeConfigurationIncomplete' } } }
    expect(paymentSettingsSaveError(error, 'fallback')).toBe('Complete all surcharge settings before saving.')
  })
})
