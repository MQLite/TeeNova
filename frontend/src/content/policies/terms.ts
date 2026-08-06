import type { PublicContentDocument } from '@/lib/public-content/types'

/**
 * Terms and conditions (Jira 10303).
 *
 * Structure only, with no boilerplate. Checkout currently asks the customer to accept nothing —
 * there is no acceptance statement and no acceptance checkbox anywhere in the checkout flow — and
 * this task adds neither. When these terms are approved, whether and how they are surfaced at
 * checkout is a separate decision with its own testing.
 */
export const termsDocument: PublicContentDocument = {
  group: 'policies',
  slug: 'terms',
  title: 'Terms and conditions',
  description: 'The terms that apply to using this website and ordering printed work.',
  classification: 'Policy',
  status: 'draft',
  approvalRequirement: 'legal',
  draftReason:
    'No terms have been drafted or reviewed. Publishing generated boilerplate as binding terms would be worse than having none.',
  related: [{ group: 'policies', slug: 'privacy' }],
  sections: [
    {
      id: 'website-use',
      heading: 'Using this website',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [{ kind: 'paragraph', text: 'Requires legal review.' }],
    },
    {
      id: 'quotes-and-estimates',
      heading: 'Quotes and price estimates',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'How long a quote stands, and the relationship between a price shown on the site and the price finally charged, require legal review. The site already recalculates every price on the server before payment.',
        },
      ],
    },
    {
      id: 'orders',
      heading: 'Placing an order',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [{ kind: 'paragraph', text: 'When a contract is formed requires legal review.' }],
    },
    {
      id: 'artwork-rights',
      heading: 'Artwork rights and permissions',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'What you warrant about artwork you upload, including that you hold the rights to have it printed, requires legal review.',
        },
      ],
    },
    {
      id: 'proof-approval',
      heading: 'Proof approval',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [{ kind: 'paragraph', text: 'Requires owner confirmation of the proofing process and legal review.' }],
    },
    {
      id: 'product-variation',
      heading: 'Product and colour variation',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Acceptable variation in garment sizing, fabric and printed colour requires owner confirmation and legal review.',
        },
      ],
    },
    {
      id: 'customer-supplied-garments',
      heading: 'Garments you supply',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [{ kind: 'paragraph', text: 'Requires legal review.' }],
    },
    {
      id: 'payment',
      heading: 'Payment',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [{ kind: 'paragraph', text: 'Covered by the payment terms, which are also unapproved.' }],
    },
    {
      id: 'production-and-delivery',
      heading: 'Production, delivery and pickup',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [{ kind: 'paragraph', text: 'Depends on turnaround and delivery rules that are unapproved.' }],
    },
    {
      id: 'cancellation-and-returns',
      heading: 'Cancellation, returns and reprints',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [{ kind: 'paragraph', text: 'Covered by the returns policy, which is also unapproved.' }],
    },
    {
      id: 'intellectual-property',
      heading: 'Intellectual property',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [{ kind: 'paragraph', text: 'Requires legal review.' }],
    },
    {
      id: 'prohibited-content',
      heading: 'Content we will not print',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [{ kind: 'paragraph', text: 'Requires owner confirmation and legal review.' }],
    },
    {
      id: 'liability',
      heading: 'Liability',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Any limitation of liability requires legal review and must not purport to exclude statutory consumer rights.',
        },
      ],
    },
    {
      id: 'consumer-rights',
      heading: 'Consumer rights',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [{ kind: 'paragraph', text: 'Requires legal review.' }],
    },
    {
      id: 'privacy-reference',
      heading: 'Privacy',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [{ kind: 'paragraph', text: 'Handled by the privacy policy, which is also unapproved.' }],
    },
    {
      id: 'changes-to-terms',
      heading: 'Changes to these terms',
      status: 'draft',
      factBasis: 'legal-approved',
      blocks: [{ kind: 'paragraph', text: 'Requires legal review.' }],
    },
    {
      id: 'contact',
      heading: 'Contacting us',
      status: 'draft',
      factBasis: 'configurable',
      evidenceReference: 'frontend/src/lib/site-contact.ts',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The contact address published with these terms comes from site configuration rather than being written into the content, because the business identity and mailbox roles are not yet decided.',
        },
      ],
    },
  ],
}
