const SURCHARGE_READINESS_MESSAGES: Record<string, string> = {
  SurchargeRateInvalid: 'The surcharge percentage is invalid.',
  SurchargeFixedAmountInvalid: 'The fixed surcharge amount is invalid.',
  SurchargeDisclosureMissing: 'Enter a customer disclosure message.',
  SurchargeDisclosureInvalid: 'The disclosure message is invalid.',
  SurchargeCalculationVersionUnsupported: 'The surcharge calculation version is unsupported.',
  SurchargeCurrencyInvalid: 'Card surcharge is only supported for NZD.',
}

export function readinessMessage(code: string): string {
  return SURCHARGE_READINESS_MESSAGES[code] ?? code
}

export function surchargeReadinessMessage(code: string, surchargeEnabled: boolean): string | null {
  if (!surchargeEnabled || !(code in SURCHARGE_READINESS_MESSAGES)) return null
  return SURCHARGE_READINESS_MESSAGES[code]
}

export function paymentSettingsSaveError(error: unknown, fallback: string): string {
  const details = (error as { details?: { error?: { code?: string } } })?.details
  if (details?.error?.code === 'TeeNova:Payment:SurchargeConfigurationIncomplete') {
    return 'Complete all surcharge settings before saving.'
  }
  return error instanceof Error ? error.message : fallback
}
