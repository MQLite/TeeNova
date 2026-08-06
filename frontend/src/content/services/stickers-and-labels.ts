import type { ServicePageDefinition } from '@/lib/service-content/types'

/**
 * Stickers and labels (Jira 10306).
 *
 * A quote-only page. Vinyl type, adhesive, waterproofing, lamination, die-cutting, sheet or roll
 * format and minimum quantity are all absent — none is recorded anywhere in the repository and none
 * has been approved. Saying "durable outdoor vinyl" would be inventing a product.
 */
export const stickersAndLabelsService: ServicePageDefinition = {
  slug: 'stickers-and-labels',
  name: 'Stickers and labels',
  shortName: 'stickers and labels',
  description:
    'Printed stickers, labels and decals for packaging, products, events and promotions — sent to us as a quote request and priced once we know the details.',
  cardSummary:
    'Printed stickers, labels and decals for packaging, products, events and promotions.',
  iconName: 'sticker',
  sortOrder: 70,

  status: 'published',
  approvalRequirement: 'none',
  lastReviewedAt: '2026-08-06',

  quoteServiceType: 'StickersLabels',
  portfolioServiceType: 'StickersLabels',

  hero: {
    eyebrow: 'Printing service',
    headline: 'Stickers and labels',
    summary:
      'Tell us what the stickers are for, how many you need and roughly what size, and attach your design. We come back to you with the price.',
  },

  sections: [
    {
      id: 'sticker-and-label-printing',
      heading: 'Sticker and label printing',
      kind: 'service-overview',
      status: 'published',
      factBasis: 'existing-public-content',
      evidenceReference:
        'Jira 10300 plan §13.1 — stickers and labels were advertised on the homepage and in the footer before Jira 10306',
      blocks: [
        {
          kind: 'paragraph',
          text: 'We print stickers, labels and decals for packaging, product ranges, events, vehicles and promotions. There is no sticker product to configure in the catalogue, so this one is quoted: send us the details and we come back to you with a price.',
        },
      ],
    },
    {
      id: 'what-to-tell-us-about-stickers',
      heading: 'What to tell us',
      kind: 'quote-process',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/app/quote/quote-form-validation.ts',
      blocks: [
        {
          kind: 'list',
          items: [
            'How many stickers or labels you need.',
            'Roughly what size each one should be, and what shape you have in mind.',
            'Where they are going — on packaging, on a product, on a window, outdoors.',
            'Your artwork, if you have it — you can attach files to the request.',
            'A date you need them by, if there is one.',
          ],
        },
        {
          kind: 'paragraph',
          text: 'Where a sticker ends up matters more than anything else for working out what it should be made of, so tell us that even if you are unsure about everything else.',
        },
      ],
    },
    {
      id: 'what-a-sticker-request-does',
      heading: 'What sending a request does',
      kind: 'quote-process',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Application/Enquiries/QuoteRequestAppService.cs',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A quote request is an enquiry. It does not create an order, it does not hold anything and it never takes a payment. You get a reference back so we can both refer to the same request, and any artwork you attach is stored privately rather than in the site’s public uploads folder.',
        },
      ],
    },
  ],

  facts: {},

  faqs: [
    {
      id: 'can-i-order-stickers-online',
      question: 'Can I order stickers online?',
      answer:
        'Not at the moment — there is no sticker or label product in the catalogue to configure. Send us a quote request and we will price it for you.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/api/catalog.ts',
    },
    {
      id: 'what-size-stickers',
      question: 'Do I need to know the exact size?',
      answer:
        'A rough size and shape is enough to start with. Tell us where the stickers are going as well, and we will confirm what suits before we price the job.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/app/quote/quote-form-validation.ts',
    },
  ],

  relatedHelpLinks: [
    { group: 'help', slug: 'artwork-requirements' },
    { group: 'help', slug: 'faq' },
  ],

  pendingApprovals: [
    'Sticker and label materials offered (vinyl type, paper, clear, removable)',
    'Adhesive types and whether removable options exist',
    'Whether outdoor-rated or water-resistant options are offered, and any expected life',
    'Lamination options',
    'Die-cutting and custom shapes',
    'Sheet, roll or individual supply formats',
    'Minimum quantity and quantity bands',
    'Price or price range',
    'Turnaround',
  ],
}
