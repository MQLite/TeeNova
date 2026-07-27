import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AdminOnlinePaymentSessionCard } from './AdminOnlinePaymentSessionCard'
import type { AdminOnlinePaymentSession } from '@/types'

function attempt(overrides: Partial<AdminOnlinePaymentSession> = {}): AdminOnlinePaymentSession {
  return {
    id: 'local-session-id',
    provider: 'Stripe',
    providerMode: 'Test',
    purpose: 'FullPayment',
    status: 'Completed',
    currency: 'NZD',
    baseAmount: 100,
    surchargeAmount: 3.04,
    chargedAmount: 103.04,
    surchargePercentageBasisPoints: 265,
    surchargeFixedAmount: 0.3,
    surchargeCalculationVersion: 'stripe-gross-up-v1',
    providerSessionId: 'cs_test_very_long_identifier_that_must_wrap',
    providerPaymentId: 'pi_test_123',
    providerEventId: 'evt_test_123',
    paymentTransactionId: 'transaction-id',
    commercialTransactionAmount: 100,
    creationTime: '2026-07-27T00:00:00Z',
    completedTime: '2026-07-27T00:01:00Z',
    rawProviderStatus: 'paid',
    webhookStatus: 'Processed',
    observedProviderAmount: 103.04,
    observedCurrency: 'NZD',
    reviewReasonCode: null,
    reconciliationStatus: 'Reconciled',
    reconciliationMessage: null,
    ...overrides,
  }
}

describe('AdminOnlinePaymentSessionCard', () => {
  it('renders persisted commercial, surcharge and charged amounts without recomputing', () => {
    render(<AdminOnlinePaymentSessionCard attempt={attempt()} latest />)
    const breakdown = screen.getByLabelText('Payment amount breakdown')
    expect(within(breakdown).getByText('Commercial payment').parentElement).toHaveTextContent('NZ$100.00')
    expect(within(breakdown).getByText('Card surcharge').parentElement).toHaveTextContent('NZ$3.04')
    expect(within(breakdown).getByText('Total collected').parentElement).toHaveTextContent('NZ$103.04')
    expect(screen.getByText('Rate').parentElement).toHaveTextContent('2.65%')
    expect(screen.getByText('Fixed fee').parentElement).toHaveTextContent('NZ$0.30')
    expect(screen.getByText('Mode').parentElement).toHaveTextContent('Test')
  })

  it('renders a legacy attempt without guessing mode or a zero-rate expression', () => {
    render(<AdminOnlinePaymentSessionCard attempt={attempt({
      providerMode: null,
      surchargeAmount: 0,
      chargedAmount: 100,
      surchargePercentageBasisPoints: 0,
      surchargeFixedAmount: 0,
      surchargeCalculationVersion: 'legacy-no-surcharge',
    })} latest={false} />)
    expect(screen.getByText('Mode').parentElement).toHaveTextContent('Unknown · legacy session')
    expect(screen.getByText('Calculation').parentElement).toHaveTextContent('Legacy · no surcharge')
    expect(screen.getAllByText('No surcharge')).toHaveLength(3)
    expect(screen.queryByText('0.00%')).not.toBeInTheDocument()
  })

  it.each([
    ['Pending', 'Pending'],
    ['Reconciled', 'Reconciled'],
    ['RequiresReview', 'Requires review'],
    ['Failed', 'Failed'],
    ['Cancelled', 'Cancelled'],
    ['Expired', 'Expired'],
  ] as const)('renders %s status as text', (status, label) => {
    render(<AdminOnlinePaymentSessionCard attempt={attempt({
      reconciliationStatus: status,
      reconciliationMessage: status === 'RequiresReview' ? 'Review this persisted mismatch.' : null,
    })} latest={false} />)
    expect(screen.getByText(label)).toBeInTheDocument()
    if (status === 'RequiresReview') expect(screen.getByRole('alert')).toHaveTextContent('Review this persisted mismatch.')
  })

  it('renders safe identifiers in wrapping, full-value labelled code elements', () => {
    render(<AdminOnlinePaymentSessionCard attempt={attempt()} latest />)
    for (const label of [
      'Local payment session ID: local-session-id',
      'Stripe Session ID: cs_test_very_long_identifier_that_must_wrap',
      'Stripe Payment ID: pi_test_123',
      'Webhook Event ID: evt_test_123',
      'Commercial transaction ID: transaction-id',
    ]) {
      expect(screen.getByLabelText(label)).toHaveClass('break-all')
    }
  })
})
