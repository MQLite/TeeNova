import type { PaymentProviderSetting } from '@/types'

export const SURCHARGE_DISCLOSURE_MAX_LENGTH = 500

export interface StripeSurchargeFormValue {
  enabled: boolean
  percentage: string
  fixedAmount: string
  disclosureText: string
  calculationVersion: string
}

export interface StripeSurchargeFormErrors {
  percentage?: string
  fixedAmount?: string
  disclosureText?: string
  calculationVersion?: string
}

export interface StripeSurchargePayload {
  surchargeEnabled: boolean
  surchargePercentageBasisPoints: number
  surchargeFixedAmount: number
  surchargeDisclosureText: string
  surchargeCalculationVersion: string
}

export function formatBasisPoints(basisPoints: number): string {
  const safe = Number.isInteger(basisPoints) && basisPoints >= 0 ? basisPoints : 0
  return `${Math.floor(safe / 100)}.${String(safe % 100).padStart(2, '0')}`
}

export function parsePercentageToBasisPoints(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const basisPoints = Number.parseInt(whole, 10) * 100 + Number.parseInt(fraction.padEnd(2, '0') || '0', 10)
  return basisPoints < 10000 ? basisPoints : null
}

export function parseFixedAmount(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const cents = Number.parseInt(whole, 10) * 100 + Number.parseInt(fraction.padEnd(2, '0') || '0', 10)
  return cents / 100
}

export function surchargeFormFromSetting(setting: PaymentProviderSetting): StripeSurchargeFormValue {
  return {
    enabled: setting.surchargeEnabled,
    percentage: formatBasisPoints(setting.surchargePercentageBasisPoints),
    fixedAmount: setting.surchargeFixedAmount.toFixed(2),
    disclosureText: setting.surchargeDisclosureText,
    calculationVersion: setting.surchargeCalculationVersion,
  }
}

export function validateSurchargeForm(value: StripeSurchargeFormValue): StripeSurchargeFormErrors {
  const errors: StripeSurchargeFormErrors = {}
  if (parsePercentageToBasisPoints(value.percentage) === null) {
    errors.percentage = /^\d+\.\d{3,}$/.test(value.percentage)
      ? 'Use no more than two decimal places.'
      : 'Enter a percentage from 0.00 to 99.99.'
  }
  if (parseFixedAmount(value.fixedAmount) === null) {
    errors.fixedAmount = /^\d+\.\d{3,}$/.test(value.fixedAmount)
      ? 'Use no more than two decimal places.'
      : 'Enter a fixed fee of 0.00 or more.'
  }
  const disclosure = value.disclosureText.trim()
  if (!disclosure) errors.disclosureText = 'Enter a customer disclosure message.'
  else if (value.disclosureText.length > SURCHARGE_DISCLOSURE_MAX_LENGTH) {
    errors.disclosureText = `Use ${SURCHARGE_DISCLOSURE_MAX_LENGTH} characters or fewer.`
  }
  if (!value.calculationVersion) errors.calculationVersion = 'The surcharge calculation version is unavailable.'
  return errors
}

export function buildSurchargePayload(value: StripeSurchargeFormValue): StripeSurchargePayload | null {
  if (Object.keys(validateSurchargeForm(value)).length > 0) return null
  const basisPoints = parsePercentageToBasisPoints(value.percentage)
  const fixedAmount = parseFixedAmount(value.fixedAmount)
  if (basisPoints === null || fixedAmount === null) return null
  return {
    surchargeEnabled: value.enabled,
    surchargePercentageBasisPoints: basisPoints,
    surchargeFixedAmount: fixedAmount,
    surchargeDisclosureText: value.disclosureText.trim(),
    surchargeCalculationVersion: value.calculationVersion,
  }
}
