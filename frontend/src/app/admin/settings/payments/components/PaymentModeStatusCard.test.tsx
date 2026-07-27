import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentModeStatusCard } from './PaymentModeStatusCard'
import type { PaymentProviderSetting } from '@/types'

function setting(overrides: Partial<PaymentProviderSetting> = {}): PaymentProviderSetting {
  return {
    provider: 'Stripe', mode: 'Test', isEnabled: true, currency: 'NZD', publishableKey: null,
    secretKeyConfigured: true, secretKeyLast4: '1234', webhookSecretConfigured: true, webhookSecretLast4: '5678',
    successReturnBaseUrl: null, cancelReturnBaseUrl: null, lastValidatedAt: null, lastValidationStatus: 'Valid',
    lastValidationMessageCode: null, isConfigured: true, canCreateCheckoutSession: true, liveModeBlocked: false,
    encryptionPassphraseConfigured: true, webhookEndpointPath: '/webhook', webhookEndpointUrl: null,
    secretsRuntimeSource: 'Database', configRuntimeSource: 'Configuration', missingPrerequisites: [], readinessCode: 'Ready',
    surchargeEnabled: false, surchargePercentageBasisPoints: 265, surchargeFixedAmount: 0.3,
    surchargeDisclosureText: 'Disclosure', surchargeCalculationVersion: 'stripe-gross-up-v1',
    ...overrides,
  }
}

describe('PaymentModeStatusCard surcharge summary', () => {
  it('shows disabled from saved server data', () => {
    render(<PaymentModeStatusCard mode="Test" setting={setting()} isActive href="/test" />)
    expect(screen.getByText('Card surcharge').parentElement).toHaveTextContent('Disabled')
  })

  it('shows saved enabled rate and fee separately from readiness', () => {
    render(<PaymentModeStatusCard mode="Test" setting={setting({ surchargeEnabled: true })} isActive href="/test" />)
    expect(screen.getByText('Card surcharge').parentElement).toHaveTextContent('Enabled · 2.65% + NZ$0.30')
    expect(screen.getByText('Ready for checkout')).toBeInTheDocument()
    expect(screen.getByText('Active runtime mode')).toBeInTheDocument()
  })
})
