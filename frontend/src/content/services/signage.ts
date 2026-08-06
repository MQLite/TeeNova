import type { ServicePageDefinition } from '@/lib/service-content/types'

/**
 * Signage (Jira 10306).
 *
 * A quote-only page. Materials, indoor or outdoor ratings, weather resistance, maximum dimensions,
 * installation and any council or building compliance position are absent: none is recorded in the
 * repository and none has been approved. Signage is the service where an invented claim carries the
 * most risk, so the page says only what the enquiry contract does.
 */
export const signageService: ServicePageDefinition = {
  slug: 'signage',
  name: 'Signage',
  shortName: 'signage',
  description:
    'Printed signs and corflute for worksites, real estate, events, shopfronts and local advertising — sent to us as a quote request with the size you need.',
  cardSummary:
    'Printed signs and corflute for worksites, real estate, events and shopfronts.',
  iconName: 'signage',
  sortOrder: 80,

  status: 'published',
  approvalRequirement: 'none',
  lastReviewedAt: '2026-08-06',

  quoteServiceType: 'Signage',
  portfolioServiceType: 'Signage',

  hero: {
    eyebrow: 'Printing service',
    headline: 'Signage',
    summary:
      'Send us the finished size of the sign, how many you need and where it is going, along with your design. We come back to you with the price.',
  },

  sections: [
    {
      id: 'sign-printing',
      heading: 'Sign printing',
      kind: 'service-overview',
      status: 'published',
      factBasis: 'existing-public-content',
      evidenceReference:
        'Jira 10300 plan §13.1 — signs and corflute were advertised on the homepage and in the footer before Jira 10306',
      blocks: [
        {
          kind: 'paragraph',
          text: 'We print signs and corflute for worksites, real estate, events, shopfronts and local advertising. Signage is not something the catalogue can price on its own, so it is handled as a quote: tell us the size and where it is going, and we come back to you.',
        },
      ],
    },
    {
      id: 'size-is-required-for-signage',
      heading: 'We need the size',
      kind: 'quote-process',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/app/quote/quote-form-validation.ts',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A signage request asks for a width, a height and the unit those measurements are in, because the finished size drives everything else about the job. Millimetres, centimetres or metres are all fine — use whichever you have.',
        },
        {
          kind: 'list',
          items: [
            'The finished width and height of the sign, and the unit.',
            'How many signs you need.',
            'Where the sign is going, and whether it will be indoors or outside.',
            'Your artwork, if you have it — you can attach files to the request.',
            'A date you need it by, if there is one.',
          ],
        },
      ],
    },
    {
      id: 'what-a-signage-request-does',
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
      id: 'do-you-need-the-sign-size',
      question: 'Do I need to know the sign size before I get in touch?',
      answer:
        'A width, a height and a unit are asked for, because the finished size drives the job. If you are unsure, tell us where the sign is going and we can work the size out with you.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/app/quote/quote-form-validation.ts',
    },
    {
      id: 'can-i-order-signage-online',
      question: 'Can I order signage online?',
      answer:
        'No — signage is quoted rather than configured in the catalogue, because the size and the setting change what the job needs.',
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
    'Sign materials offered (corflute thickness, ACM, acrylic, vinyl on substrate)',
    'Indoor and outdoor suitability, and any expected outdoor life',
    'Maximum printable dimensions',
    'Whether frames, stands, fixings or installation are offered',
    'Any position on council, building or resource-consent requirements',
    'Price or price range',
    'Minimum quantity, if any',
    'Turnaround',
  ],
}
