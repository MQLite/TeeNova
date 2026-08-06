import type { ServicePageDefinition } from '@/lib/service-content/types'

/**
 * Business cards (Jira 10306).
 *
 * There is no business-card product in the catalogue, so this page is deliberately a quote page and
 * nothing more. It says the service is offered — which the site already said, from the homepage and
 * the footer, before this task — and it says exactly what sending a request does. Paper stock,
 * finishes, sizes, quantities, price and turnaround are absent because none of them exist anywhere
 * in the repository and none has been approved.
 */
export const businessCardsService: ServicePageDefinition = {
  slug: 'business-cards',
  name: 'Business cards',
  shortName: 'business cards',
  description:
    'Business card printing for businesses, trades, events and individual projects — sent to us as a quote request and priced after we have seen the details.',
  cardSummary:
    'Business cards for a business, a trade, an event or a one-off project — send us the details for a price.',
  iconName: 'business-card',
  sortOrder: 60,

  status: 'published',
  approvalRequirement: 'none',
  lastReviewedAt: '2026-08-06',

  quoteServiceType: 'BusinessCards',
  portfolioServiceType: 'BusinessCards',

  hero: {
    eyebrow: 'Printing service',
    headline: 'Business cards',
    summary:
      'Business cards are quoted rather than ordered online. Send us how many you need and your artwork, and we will come back to you with the price.',
  },

  sections: [
    {
      id: 'business-card-printing',
      heading: 'Business card printing',
      kind: 'service-overview',
      status: 'published',
      factBasis: 'existing-public-content',
      evidenceReference:
        'Jira 10300 plan §13.1 — business cards were advertised on the homepage and in the footer before Jira 10306',
      blocks: [
        {
          kind: 'paragraph',
          text: 'We print business cards for businesses, trades, community groups, events and one-off personal projects. There is no business card product to configure in the catalogue, so this one is handled as a quote: you send us what you need and we come back to you with a price.',
        },
      ],
    },
    {
      id: 'what-to-send-us',
      heading: 'What to send us',
      kind: 'quote-process',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/app/quote/quote-form-validation.ts',
      blocks: [
        {
          kind: 'list',
          items: [
            'How many cards you need.',
            'Your artwork, if you already have it — you can attach files to the request.',
            'Anything particular about the finish or the layout you have in mind.',
            'A date you need them by, if there is one.',
            'Whether you would collect them or want them delivered.',
          ],
        },
        {
          kind: 'paragraph',
          text: 'If you do not have artwork yet, send the request anyway and tell us what you want on the cards. We would rather start the conversation than have you wait until everything is ready.',
        },
      ],
    },
    {
      id: 'what-a-request-does',
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
      id: 'can-i-order-business-cards-online',
      question: 'Can I order business cards online?',
      answer:
        'Not at the moment — there is no business card product in the catalogue to configure. Send us a quote request instead and we will price it for you.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/api/catalog.ts',
    },
    {
      id: 'do-i-need-finished-artwork-for-cards',
      question: 'Do I need finished artwork before I get in touch?',
      answer:
        'No. Send the request with whatever you have and tell us what you want on the cards. You can attach files to the request if you already have them.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Domain/Enquiries/QuoteRequestAttachment.cs',
    },
  ],

  relatedHelpLinks: [
    { group: 'help', slug: 'artwork-requirements' },
    { group: 'help', slug: 'faq' },
  ],

  pendingApprovals: [
    'Paper stocks offered',
    'Finishes (for example lamination, rounded corners, spot treatments)',
    'Card sizes and orientation options',
    'Standard quantity bands and any minimum quantity',
    'Price or price range',
    'Turnaround',
    'Whether a design service is offered for customers without artwork',
  ],
}
