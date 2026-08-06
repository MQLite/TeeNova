import type { PublicContentDocument } from '@/lib/public-content/types'

/**
 * Payment terms (Jira 10303).
 *
 * The repository contains contradictory payment signals and this document does not resolve them —
 * it records them. The footer advertised bank transfer, cash and Eftpos while checkout offers a
 * manual-payment path and a hosted online card payment with four selectable providers, and the
 * order aggregate implements a deposit rule for pickup orders. Which of these is actually offered
 * to the public is an owner decision.
 *
 * No deposit percentage, invoice term or payment deadline is invented here; the deposit figure
 * described below is the rule the order aggregate already enforces, not a proposal. Publication
 * still requires owner and legal approval, and no payment, surcharge or checkout code was changed.
 */
export const paymentTermsDocument: PublicContentDocument = {
  group: 'policies',
  slug: 'payment-terms',
  title: 'Payment terms',
  description: 'When payment is due, which methods are accepted, and how refunds are handled.',
  classification: 'Policy',
  status: 'draft',
  approvalRequirement: 'owner-and-legal',
  draftReason:
    'The payment methods offered to the public are not confirmed and the site currently carries contradictory signals. Invoice terms, surcharge disclosure wording and refund processing require owner and legal approval.',
  related: [{ group: 'policies', slug: 'terms' }],
  sections: [
    {
      id: 'quote-versus-order',
      heading: 'A quote is not an order',
      status: 'draft',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Application/Enquiries/QuoteRequestAppService.cs',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Requesting a quote takes no payment and creates no order. Payment only becomes relevant once an order is placed.',
        },
      ],
    },
    {
      id: 'when-payment-is-due',
      heading: 'When payment is due',
      status: 'draft',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Domain/Orders/Order.cs',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The order system currently requires a shipped order to be paid in full before it is processed, and a pickup order to have paid at least half of the order total as a deposit, with the balance due at collection. This is the rule the software enforces today; whether it is the rule the business wants to publish requires owner confirmation.',
        },
      ],
    },
    {
      id: 'supported-methods',
      heading: 'Payment methods',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Checkout offers either arranging payment directly with the shop or paying online through a hosted payment page. Which in-person methods are accepted, and which online provider is live, are owner decisions and are not stated until confirmed.',
        },
      ],
    },
    {
      id: 'card-processing',
      heading: 'Card processing',
      status: 'draft',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Domain/Payments/OnlinePaymentSession.cs',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Card details are entered on the payment provider’s own hosted page, not on this site, and this site does not store card numbers. An order is treated as paid only after the provider confirms the payment.',
        },
      ],
    },
    {
      id: 'surcharges',
      heading: 'Card surcharges',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The system supports an optional card surcharge configured by staff. Whether a surcharge is applied, and how it is disclosed, requires owner and legal approval.',
        },
      ],
    },
    {
      id: 'currency-and-tax',
      heading: 'Currency and GST',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'All amounts are in New Zealand dollars, shown as NZ$. Whether displayed prices include GST, and the GST registration details that must appear on an invoice, require owner confirmation.',
        },
      ],
    },
    {
      id: 'invoices-and-accounts',
      heading: 'Invoices and account terms',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Whether invoices or account terms are offered to business customers, the payment period attached to them and any bank transfer reference format require owner approval.',
        },
      ],
    },
    {
      id: 'failed-payments',
      heading: 'Failed and cancelled payments',
      status: 'draft',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/app/checkout/cancel/page.tsx',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'If an online payment does not complete, the order is still recorded and remains unpaid; you can return and pay, or arrange payment with the shop. Nothing is produced against an unpaid order.',
        },
      ],
    },
    {
      id: 'refunds',
      heading: 'Refunds and chargebacks',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'How a refund is assessed and processed, and how a chargeback is handled, require owner and legal approval alongside the returns policy. The site has no automated refund process; refunds are arranged directly with us.',
        },
      ],
    },
  ],
}
