import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaymentProviderSetting, PaymentSettingsOverview } from '@/types'
import TestModeSettingsClient from './test/TestModeSettingsClient'
import LiveModeSettingsClient from './live/LiveModeSettingsClient'

const api = vi.hoisted(() => ({
  getOverview: vi.fn(),
  getStripe: vi.fn(),
  updateStripeTest: vi.fn(),
  updateStripeLive: vi.fn(),
  disableStripeTest: vi.fn(),
  disableStripeLive: vi.fn(),
  validateStripeTest: vi.fn(),
}))

vi.mock('@/api/payment-settings', () => ({ makePaymentSettingsApi: () => api }))
vi.mock('@/lib/admin-client', () => ({ adminApiClient: {}, redirectToLogin: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/settings/payments/test' }))

function paymentSetting(mode: 'Test' | 'Live', overrides: Partial<PaymentProviderSetting> = {}): PaymentProviderSetting {
  return {
    provider: 'Stripe', mode, isEnabled: false, currency: 'NZD', publishableKey: null,
    secretKeyConfigured: true, secretKeyLast4: '1234', webhookSecretConfigured: true, webhookSecretLast4: '5678',
    successReturnBaseUrl: null, cancelReturnBaseUrl: null, lastValidatedAt: null, lastValidationStatus: 'Valid',
    lastValidationMessageCode: null, isConfigured: true, canCreateCheckoutSession: true, liveModeBlocked: false,
    encryptionPassphraseConfigured: true, webhookEndpointPath: '/webhook', webhookEndpointUrl: null,
    secretsRuntimeSource: 'Database', configRuntimeSource: 'Configuration', missingPrerequisites: [], readinessCode: 'Ready',
    surchargeEnabled: false, surchargePercentageBasisPoints: mode === 'Test' ? 265 : 125,
    surchargeFixedAmount: mode === 'Test' ? 0.3 : 0.5,
    surchargeDisclosureText: `${mode} disclosure`,
    surchargeCalculationVersion: 'stripe-gross-up-v1',
    ...overrides,
  }
}

function overview(unlocked = true): PaymentSettingsOverview {
  return {
    test: paymentSetting('Test'),
    live: paymentSetting('Live'),
    liveModeConfigurationUnlocked: unlocked,
    activeMode: 'Test',
    activeModeIsLive: false,
    activeModeSource: 'Configuration',
    liveConfirmationPhrase: 'ENABLE LIVE MODE',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  const data = overview()
  api.getOverview.mockResolvedValue(data)
  api.updateStripeTest.mockResolvedValue(data.test)
  api.updateStripeLive.mockResolvedValue(data.live)
})

describe('Test payment settings surcharge isolation', () => {
  it('initialises only Test values and saves all five fields to only the Test endpoint', async () => {
    render(<TestModeSettingsClient role="Admin" />)
    expect(await screen.findByLabelText('Percentage rate')).toHaveValue('2.65')
    expect(screen.getByLabelText('Customer disclosure')).toHaveValue('Test disclosure')
    expect(screen.queryByDisplayValue('Live disclosure')).not.toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Percentage rate'))
    await userEvent.type(screen.getByLabelText('Percentage rate'), '3.10')
    await userEvent.click(screen.getByRole('button', { name: 'Save Test settings' }))

    await waitFor(() => expect(api.updateStripeTest).toHaveBeenCalledTimes(1))
    expect(api.updateStripeTest).toHaveBeenCalledWith(expect.objectContaining({
      surchargeEnabled: false,
      surchargePercentageBasisPoints: 310,
      surchargeFixedAmount: 0.3,
      surchargeDisclosureText: 'Test disclosure',
      surchargeCalculationVersion: 'stripe-gross-up-v1',
    }))
    expect(api.updateStripeLive).not.toHaveBeenCalled()
  })

  it('blocks an invalid percentage before an endpoint call', async () => {
    render(<TestModeSettingsClient role="Admin" />)
    await screen.findByLabelText('Percentage rate')
    await userEvent.clear(screen.getByLabelText('Percentage rate'))
    await userEvent.type(screen.getByLabelText('Percentage rate'), '100')
    await userEvent.click(screen.getByRole('button', { name: 'Save Test settings' }))
    expect(await screen.findByText('Enter a percentage from 0.00 to 99.99.')).toBeInTheDocument()
    expect(api.updateStripeTest).not.toHaveBeenCalled()
  })
})

describe('Live payment settings surcharge guard and isolation', () => {
  it('initialises only Live values and requires the exact phrase for surcharge-only save', async () => {
    render(<LiveModeSettingsClient role="Admin" />)
    expect(await screen.findByLabelText('Percentage rate')).toHaveValue('1.25')
    expect(screen.getByLabelText('Customer disclosure')).toHaveValue('Live disclosure')
    expect(screen.queryByDisplayValue('Test disclosure')).not.toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Percentage rate'))
    await userEvent.type(screen.getByLabelText('Percentage rate'), '1.75')
    const save = screen.getByRole('button', { name: 'Save live settings' })
    expect(save).toBeDisabled()

    await userEvent.type(screen.getByPlaceholderText('ENABLE LIVE MODE'), 'WRONG')
    expect(save).toBeDisabled()
    expect(api.updateStripeLive).not.toHaveBeenCalled()

    await userEvent.clear(screen.getByPlaceholderText('ENABLE LIVE MODE'))
    await userEvent.type(screen.getByPlaceholderText('ENABLE LIVE MODE'), 'ENABLE LIVE MODE')
    await userEvent.click(save)
    await waitFor(() => expect(api.updateStripeLive).toHaveBeenCalledTimes(1))
    expect(api.updateStripeLive).toHaveBeenCalledWith(expect.objectContaining({
      confirmationPhrase: 'ENABLE LIVE MODE',
      surchargeEnabled: false,
      surchargePercentageBasisPoints: 175,
      surchargeFixedAmount: 0.5,
      surchargeDisclosureText: 'Live disclosure',
      surchargeCalculationVersion: 'stripe-gross-up-v1',
    }))
    expect(api.updateStripeTest).not.toHaveBeenCalled()
  })

  it('renders saved Live values read-only and no save control while locked', async () => {
    api.getOverview.mockResolvedValue(overview(false))
    render(<LiveModeSettingsClient role="Admin" />)
    expect(await screen.findByText('Live configuration is locked.')).toBeInTheDocument()
    expect(screen.getByLabelText('Percentage rate')).toHaveValue('1.25')
    expect(screen.getByLabelText('Percentage rate')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save live settings' })).not.toBeInTheDocument()
    expect(api.updateStripeLive).not.toHaveBeenCalled()
  })
})
