import type { PublicContentDocument } from '@/lib/public-content/types'

/**
 * Turnaround times (Jira 10303).
 *
 * The document framework is implemented; no duration is stated. Every operational period on this
 * page is an owner decision, and none has been approved. The whole document therefore stays Draft
 * and is not linked from public navigation. The previous hard-coded "Fast turnaround" claim was
 * removed under Jira 10302 and is not reinstated here.
 */
export const turnaroundDocument: PublicContentDocument = {
  group: 'help',
  slug: 'turnaround',
  title: 'Turnaround times',
  description: 'How long a print job takes, and what affects the timing.',
  classification: 'Customer help',
  status: 'draft',
  approvalRequirement: 'owner',
  draftReason:
    'No standard, rush or per-service turnaround period has been approved by the business owner. Publishing any duration without that approval would be an invented promise.',
  related: [{ group: 'help', slug: 'artwork-requirements' }],
  sections: [
    {
      id: 'standard-turnaround',
      heading: 'Standard turnaround',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The standard production period for each service requires owner approval before it is published. No default period is assumed.',
        },
      ],
    },
    {
      id: 'rush-work',
      heading: 'Rush and urgent work',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Whether urgent work is offered, the conditions attached to it and any additional charge require owner approval.',
        },
      ],
    },
    {
      id: 'artwork-and-proofing-delays',
      heading: 'Artwork and proofing',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Whether the production clock starts on order, on receipt of usable artwork or on proof approval requires owner approval.',
        },
      ],
    },
    {
      id: 'stock-availability',
      heading: 'Stock availability',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The site records garment stock for staff information only and never uses it to gate checkout, so a published statement about how stock affects timing needs owner confirmation of the real ordering process.',
        },
      ],
    },
    {
      id: 'quantity-and-complexity',
      heading: 'Quantity and complexity',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'How larger quantities, multiple print positions or multiple products change the schedule requires owner approval.',
        },
      ],
    },
    {
      id: 'pickup-and-delivery-timing',
      heading: 'Pickup and delivery timing',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Any period between a job being finished and being ready for collection or handed to a courier requires owner approval, and depends on the delivery and pickup rules that are also unapproved.',
        },
      ],
    },
    {
      id: 'date-estimates',
      heading: 'Dates are estimates',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The wording that explains a quoted date is an estimate rather than a guarantee requires owner approval, because it interacts with the returns and cancellation policy that is also awaiting review.',
        },
      ],
    },
    {
      id: 'telling-us-your-date',
      heading: 'Telling us the date you need',
      status: 'draft',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/app/quote/quote-form-validation.ts',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The quote form has an optional required-date field that accepts today or any future date. Supplying it lets us tell you whether the date is achievable when we reply. This section stays unpublished with the rest of the page so that it is not read as a timing promise on its own.',
        },
      ],
    },
  ],
}
