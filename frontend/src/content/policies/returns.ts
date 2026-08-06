import type { PublicContentDocument } from '@/lib/public-content/types'

/**
 * Returns, reprints and cancellation (Jira 10303).
 *
 * Structure only. No refund, reprint or cancellation rule is written from general assumptions, and
 * no backend behaviour was added: there is no refund workflow, no reprint workflow and no new order
 * status transition. The document requires both owner and legal approval and may stay unpublished
 * indefinitely.
 *
 * Nothing here reduces a consumer's statutory rights, and no "no refunds" position is stated.
 */
export const returnsDocument: PublicContentDocument = {
  group: 'policies',
  slug: 'returns',
  title: 'Returns, reprints and cancellation',
  description: 'What happens if something is wrong with your order, or you need to cancel it.',
  classification: 'Policy',
  status: 'draft',
  approvalRequirement: 'owner-and-legal',
  draftReason:
    'No returns, reprint or cancellation rule has been approved, and the wording interacts with consumer law, so both owner and legal approval are required before any of it is published.',
  related: [{ group: 'policies', slug: 'terms' }],
  sections: [
    {
      id: 'custom-products',
      heading: 'Custom-made products',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'How a personalised, made-to-order item is treated differently from a stock item requires owner and legal approval.',
        },
      ],
    },
    {
      id: 'change-of-mind',
      heading: 'Change of mind',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [
        { kind: 'paragraph', text: 'The change-of-mind position requires owner and legal approval.' },
      ],
    },
    {
      id: 'faulty-or-incorrect',
      heading: 'Faulty or incorrectly produced work',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'How a manufacturing fault or an item produced differently from what was agreed is assessed and remedied requires owner and legal approval.',
        },
      ],
    },
    {
      id: 'customer-artwork-errors',
      heading: 'Errors in artwork you supplied',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Responsibility for spelling, layout, resolution or colour problems present in supplied artwork requires owner and legal approval, and depends on the artwork guidance that has not been approved either.',
        },
      ],
    },
    {
      id: 'approved-proofs',
      heading: 'Work printed from an approved proof',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Whether a proof is issued at all, and what approving one means, is unapproved, so nothing is stated about work printed from an approved proof.',
        },
      ],
    },
    {
      id: 'reporting-a-problem',
      heading: 'Reporting a problem',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The period within which a problem must be raised, and the evidence needed to assess it, require owner and legal approval. No period is assumed.',
        },
      ],
    },
    {
      id: 'reprint-or-refund',
      heading: 'Reprint or refund',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'How a remedy is chosen between reprinting and refunding requires owner and legal approval. The site has no automated refund or reprint process; any remedy is arranged directly with us.',
        },
      ],
    },
    {
      id: 'cancellation',
      heading: 'Cancelling an order',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Cancellation before any work starts, after artwork preparation has begun and after production has begun are three different situations, each requiring owner and legal approval before a rule is published.',
        },
      ],
    },
    {
      id: 'customer-supplied-garments',
      heading: 'Garments you supplied',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'What happens if a garment you supplied is damaged during printing requires owner and legal approval.',
        },
      ],
    },
    {
      id: 'shipping-damage',
      heading: 'Damage in transit',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Responsibility for damage that happens in transit depends on delivery arrangements that are themselves unapproved.',
        },
      ],
    },
    {
      id: 'consumer-law',
      heading: 'Your rights under consumer law',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Statutory consumer rights are not affected by anything on this page. The precise wording of this section requires legal review.',
        },
      ],
    },
  ],
}
