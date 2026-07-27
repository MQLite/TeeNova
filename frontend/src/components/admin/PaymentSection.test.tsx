import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentSection } from './PaymentSection'
import type { AdminOnlinePaymentSession, Order } from '@/types'

const order = {
  id: 'order-id', orderNumber: 'ORD-1', status: 'Paid', displayStatus: 'Paid', isApprovedForPrinting: false,
  deliveryMethod: 'Pickup', customerName: 'Customer', customerEmail: 'customer@example.com',
  totalAmount: 100,
  shippingAddress: { fullName: 'Customer', addressLine1: '1 Test Street', city: 'Auckland', postalCode: '1010', country: 'NZ' },
  items: [], notes: null, adminNotes: null,
  creationTime: '2026-07-27T00:00:00Z', timeline: [], paymentStatus: 'Paid',
  paymentRequirementType: 'FullPaymentRequired', requiredDepositAmount: null, requiredPaymentAmount: 100,
  paidAmount: 100, balanceAmount: 0, depositPaidAt: null, fullyPaidAt: '2026-07-27T00:00:00Z',
  lastPaymentMethod: 'Online', lastPaymentReference: null, lastPaymentNote: null,
  paymentTransactions: [{ id: 'tx', orderId: 'order-id', amount: 100, method: 'Online', creationTime: '2026-07-27T00:00:00Z' }],
  priceAdjustments: [], hasPriceAdjustment: false,
} as Order

function attempt(id: string, status: AdminOnlinePaymentSession['reconciliationStatus']): AdminOnlinePaymentSession {
  return {
    id, provider: 'Stripe', providerMode: 'Test', purpose: 'FullPayment', status: status === 'Failed' ? 'Failed' : 'Completed',
    currency: 'NZD', baseAmount: 100, surchargeAmount: 3.04, chargedAmount: 103.04,
    surchargePercentageBasisPoints: 265, surchargeFixedAmount: 0.3, surchargeCalculationVersion: 'stripe-gross-up-v1',
    providerSessionId: `cs_${id}`, providerPaymentId: null, providerEventId: null,
    paymentTransactionId: status === 'Reconciled' ? 'tx' : null,
    commercialTransactionAmount: status === 'Reconciled' ? 100 : null,
    creationTime: id === 'newer' ? '2026-07-27T02:00:00Z' : '2026-07-27T01:00:00Z',
    completedTime: null, rawProviderStatus: null, webhookStatus: null,
    observedProviderAmount: null, observedCurrency: null, reviewReasonCode: null,
    reconciliationStatus: status, reconciliationMessage: null,
  }
}

describe('PaymentSection commercial boundary and attempts', () => {
  it('keeps order totals commercial-only and puts surcharge only in attempt details', () => {
    render(<PaymentSection order={order} onlinePaymentSessions={[attempt('one', 'Reconciled')]} onRecordPayment={() => {}} onAdjustPrice={() => {}} />)
    expect(screen.getByText('Order Total').parentElement?.parentElement).toHaveTextContent('$100.00')
    expect(screen.getByText('Commercial Paid Amount').parentElement).toHaveTextContent('$100.00')
    expect(screen.getByText('Commercial Balance Due').parentElement).toHaveTextContent('$0.00')
    expect(screen.getByText('Card surcharge').parentElement).toHaveTextContent('NZ$3.04')
    expect(screen.getByText('Commercial payment transaction')).toBeInTheDocument()
  })

  it('shows the online-attempt empty state without removing manual history', () => {
    render(<PaymentSection order={order} onlinePaymentSessions={[]} onRecordPayment={() => {}} onAdjustPrice={() => {}} />)
    expect(screen.getByText('No online payment attempts have been created for this order.')).toBeInTheDocument()
    expect(screen.getByText('Commercial payment transaction')).toBeInTheDocument()
  })

  it('keeps multiple equal-amount attempts distinct in supplied newest-first order', () => {
    render(<PaymentSection order={order} onlinePaymentSessions={[attempt('newer', 'Reconciled'), attempt('older', 'Failed')]} onRecordPayment={() => {}} onAdjustPrice={() => {}} />)
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveTextContent('Latest attempt')
    expect(cards[0]).toHaveTextContent('Reconciled')
    expect(cards[1]).toHaveTextContent('Failed')
    expect(screen.getAllByText('NZ$103.04')).toHaveLength(2)
  })
})
