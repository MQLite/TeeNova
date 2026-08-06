import type { ServicePageDefinition } from '@/lib/service-content/types'

/**
 * Custom round button badges (Jira 10306).
 *
 * The catalogue models badges as their own product kind with quantity-tier unit pricing, so the
 * published content describes that ordering behaviour and links to whichever badge products are
 * active. Badge sizes, finishes, backing type, minimum quantity and price are **not** generalised
 * from any one product: the product page is the authority for its own numbers, and this page
 * deliberately carries none.
 */
export const customRoundButtonBadgesService: ServicePageDefinition = {
  slug: 'custom-round-button-badges',
  name: 'Custom round button badges',
  shortName: 'button badges',
  description:
    'Custom printed button badges for events, teams, schools and campaigns — priced by quantity on the product page, or quoted if you need something the catalogue does not cover.',
  cardSummary:
    'Printed button badges for events, teams, schools and campaigns, priced by quantity on the product page.',
  iconName: 'badge',
  sortOrder: 30,

  status: 'published',
  approvalRequirement: 'none',
  lastReviewedAt: '2026-08-06',

  quoteServiceType: 'Badges',
  portfolioServiceType: 'Badges',

  hero: {
    eyebrow: 'Printing service',
    headline: 'Custom round button badges',
    summary:
      'Badges are ordered by quantity: you choose how many you need, attach your artwork, and the price for that quantity comes back from our pricing service.',
  },

  sections: [
    {
      id: 'how-badges-are-ordered',
      heading: 'How badges are ordered',
      kind: 'ordering',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/components/products/BadgeProductDetail.tsx',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A badge product is ordered by quantity rather than by colour and size. You enter how many badges you want, attach the artwork you want printed, and the price for that quantity is calculated by our pricing service and shown before you add anything to your cart.',
        },
        {
          kind: 'paragraph',
          text: 'Badge pricing is arranged in quantity bands, so the unit price depends on how many you order. Each badge product carries its own bands and its own smallest orderable quantity, which are shown on that product’s page.',
        },
        {
          kind: 'notice',
          tone: 'info',
          title: 'The product page is the authority for its own numbers',
          text: 'Quantity bands, unit prices and the smallest quantity a badge product accepts belong to that product. This page does not repeat them, because one badge product’s figures are not automatically true of another.',
        },
      ],
    },
    {
      id: 'artwork-for-badges',
      heading: 'Artwork for badges',
      kind: 'artwork',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/components/products/BadgeProductDetail.tsx',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Artwork is attached to the badge order itself, and you can add a note with it — for example about how the design should sit within the badge. Some badge products require a design file before the order can be added to the cart; the product page tells you when that applies.',
        },
        {
          kind: 'paragraph',
          text: 'Accepted file types and size limits are the same as everywhere else on the site and are set out on the artwork and file requirements page.',
        },
      ],
    },
    {
      id: 'asking-for-a-badge-quote',
      heading: 'Asking for a badge quote',
      kind: 'quote-process',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Domain.Shared/Enquiries/QuoteServiceType.cs',
      blocks: [
        {
          kind: 'paragraph',
          text: 'If you need a badge job the catalogue does not cover — a different quantity, a different specification, or a run for an event with particular requirements — send it to us as a quote request instead. That is an enquiry: no order is created, no stock is held and no payment is taken.',
        },
      ],
    },
  ],

  facts: {},

  faqs: [
    {
      id: 'can-i-order-badges-online',
      question: 'Can I order badges online?',
      answer:
        'Yes, when a badge product is listed in the catalogue. You choose the quantity, attach artwork, and add it to your cart at the price our pricing service works out for that quantity.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/components/products/BadgeProductDetail.tsx',
    },
    {
      id: 'does-the-badge-price-change-with-quantity',
      question: 'Does the badge price change with quantity?',
      answer:
        'Yes. Badge products are priced in quantity bands, so the unit price depends on how many you order. The bands that apply are shown on the product page.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Domain.Shared/Catalog/PricingModel.cs',
    },
    {
      id: 'do-i-have-to-supply-artwork',
      question: 'Do I have to supply artwork for badges?',
      answer:
        'Some badge products require a design file before the order can be added to the cart. The product page states whether that applies before you configure it.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/components/products/BadgeProductDetail.tsx',
    },
  ],

  relatedProductKinds: ['Badge'],
  relatedHelpLinks: [
    { group: 'help', slug: 'artwork-requirements' },
    { group: 'help', slug: 'faq' },
  ],

  pendingApprovals: [
    'Badge diameters offered as a service (as distinct from any one product)',
    'Backing type and finish',
    'Materials',
    'A service-wide minimum quantity, if one exists',
    'Any published starting price or price range',
    'Turnaround',
  ],
}
