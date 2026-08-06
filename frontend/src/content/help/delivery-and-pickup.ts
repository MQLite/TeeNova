import type { PublicContentDocument } from '@/lib/public-content/types'

/**
 * Shipping, delivery and pickup (Jira 10303).
 *
 * The only fulfilment facts the code can prove are the choices the site offers: the quote form
 * accepts Pickup, Delivery or Not sure, and checkout accepts Pickup or Shipping. Carriers, fees,
 * areas, timeframes, tracking and liability are all unapproved, so the document stays Draft.
 *
 * The shop address and opening hours that appear elsewhere on the site are inherited content that
 * the owner has not yet confirmed (recorded as a business blocker under Jira 10302). They are
 * deliberately not repeated here as policy facts.
 */
export const deliveryAndPickupDocument: PublicContentDocument = {
  group: 'help',
  slug: 'delivery-and-pickup',
  title: 'Delivery and pickup',
  description: 'How finished work reaches you — collection from the shop, local delivery or courier.',
  classification: 'Customer help',
  status: 'draft',
  approvalRequirement: 'owner',
  draftReason:
    'No delivery area, carrier, charge, threshold, timeframe, tracking or failed-delivery rule has been approved. The shop address and opening hours also remain unconfirmed.',
  related: [{ group: 'help', slug: 'turnaround' }],
  sections: [
    {
      id: 'fulfilment-choices',
      heading: 'The choices the site offers',
      status: 'draft',
      factBasis: 'implemented-code',
      evidenceReference:
        'backend/src/TeeNova.Domain.Shared/Enquiries/QuoteFulfilmentPreference.cs; frontend/src/app/checkout/page.tsx',
      blocks: [
        {
          kind: 'list',
          items: [
            'The quote form asks whether you would prefer pickup or delivery, and accepts "not sure".',
            'Checkout offers pickup or shipping, and asks for a delivery address when you choose shipping.',
          ],
        },
        {
          kind: 'paragraph',
          text:
            'What each choice means in practice — where we deliver, what it costs and how long it takes — is not yet confirmed, so this page is unpublished.',
        },
      ],
    },
    {
      id: 'store-pickup',
      heading: 'Collecting from the shop',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Collection address, collection hours, parking and entrance guidance, identification requirements and who may collect on your behalf all require owner approval.',
        },
      ],
    },
    {
      id: 'local-delivery',
      heading: 'Local delivery',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Whether local delivery is offered, which suburbs it covers and what it costs require owner approval.',
        },
      ],
    },
    {
      id: 'courier-shipping',
      heading: 'Courier shipping',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Carrier, coverage, packaging, tracking availability and responsibility for courier delays require owner approval. No claim about the area we ship to is made until that approval exists.',
        },
      ],
    },
    {
      id: 'address-confirmation',
      heading: 'Confirming your address',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'How and when a delivery address is confirmed before dispatch requires owner approval.',
        },
      ],
    },
    {
      id: 'delivery-charges',
      heading: 'Delivery charges',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Delivery pricing, any free-delivery threshold and how a charge is quoted require owner approval. Amounts are shown in New Zealand dollars.',
        },
      ],
    },
    {
      id: 'delivery-estimates',
      heading: 'Delivery estimates',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Delivery timeframes depend on the turnaround periods that are also unapproved, so no estimate is published.',
        },
      ],
    },
    {
      id: 'failed-delivery',
      heading: 'If a delivery cannot be completed',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Redelivery, return to shop, storage and any additional charge require owner approval and interact with the returns policy that is awaiting legal review.',
        },
      ],
    },
    {
      id: 'large-format-collection',
      heading: 'Large-format work',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Whether banners, signage and other large-format work can be sent by courier or must be collected requires owner approval.',
        },
      ],
    },
    {
      id: 'inspection-on-pickup',
      heading: 'Checking your order',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Any expectation that you inspect work at the counter, and the period within which a problem must be raised, require owner and legal approval alongside the returns policy.',
        },
      ],
    },
  ],
}
