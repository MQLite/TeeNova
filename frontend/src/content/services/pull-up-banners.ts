import type { ServicePageDefinition } from '@/lib/service-content/types'

/**
 * Pull-up banners (Jira 10306).
 *
 * Kept separate from PVC banners because the site advertises them separately and the enquiry treats
 * them as a distinct material with its own stand question. The two size presets published here are
 * the presets the banner enquiry form actually offers as *labels*; they are not a claim that those
 * are the only sizes available, and no price is attached to them — the code that defines them says
 * in as many words that no preset price table exists.
 *
 * No catalogue mapping is declared: the catalogue records a Banner product kind but does not record
 * which banner products are pull-ups, and inventing that mapping would be a fabricated product
 * relationship.
 */
export const pullUpBannersService: ServicePageDefinition = {
  slug: 'pull-up-banners',
  name: 'Pull-up banners',
  shortName: 'pull-up banners',
  description:
    'Printed pull-up banners for events, trade stands, churches and shopfronts. Send us the size and design and we will confirm the price.',
  cardSummary:
    'Printed pull-up banners for events, trade stands and shopfronts — quoted from the size and design you send us.',
  iconName: 'pull-up-banner',
  sortOrder: 50,

  status: 'published',
  approvalRequirement: 'none',
  lastReviewedAt: '2026-08-06',

  quoteServiceType: 'Banners',
  portfolioServiceType: 'Banners',

  hero: {
    eyebrow: 'Printing service',
    headline: 'Pull-up banners',
    summary:
      'Tell us the size you want, whether you need a stand with it, and attach your design. We confirm the price with you before anything is produced.',
  },

  sections: [
    {
      id: 'how-a-pull-up-banner-is-quoted',
      heading: 'How a pull-up banner is quoted',
      kind: 'quote-process',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Domain/Enquiries/BannerQuoteRequest.cs',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A pull-up banner is sent to us as an enquiry rather than priced automatically. The request records the finished width and height, the unit those measurements are in, how many you need, and whether a stand is included with the banner.',
        },
        {
          kind: 'paragraph',
          text: 'You can attach your design to the request and add a note about colours or layout. Nothing is ordered and no payment is taken by sending it — we reply with the price.',
        },
      ],
    },
    {
      id: 'sizes-you-can-pick-from',
      heading: 'Sizes you can pick from',
      kind: 'quote-process',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/components/products/BannerProductDetail.tsx',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The enquiry form offers a couple of common pull-up sizes as shortcuts so you do not have to measure, and it also lets you type your own width and height instead. Picking a shortcut only records the size — it does not attach a price to it.',
        },
      ],
    },
    {
      id: 'artwork-for-pull-up-banners',
      heading: 'Artwork for pull-up banners',
      kind: 'artwork',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/components/products/BannerProductDetail.tsx',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Send your design with the enquiry if you have it. Accepted file types and size limits are set out on the artwork and file requirements page, and we will tell you if we need anything else from you.',
        },
      ],
    },
  ],

  facts: {
    sizes: {
      value: ['Pull-up 850 × 2000 mm', 'Pull-up 1000 × 2000 mm'],
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference:
        'frontend/src/components/products/BannerProductDetail.tsx (PRESET_LABELS — size labels only, no preset price table)',
      presentation: 'requestable-options',
      note: 'Size shortcuts the banner enquiry form offers. You can also enter your own width and height instead of using one of these.',
    },
  },

  faqs: [
    {
      id: 'is-a-stand-included',
      question: 'Can I ask for a stand with the banner?',
      answer:
        'Yes. The enquiry records whether you want a stand with the banner, so tell us either way and we will confirm what the job includes.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Domain/Enquiries/BannerQuoteRequest.cs',
    },
    {
      id: 'can-i-choose-my-own-pull-up-size',
      question: 'Can I choose my own size?',
      answer:
        'Yes. The size shortcuts are only there to save you measuring — you can enter your own width and height in millimetres, centimetres or metres.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/components/products/BannerProductDetail.tsx',
    },
  ],

  relatedHelpLinks: [
    { group: 'help', slug: 'artwork-requirements' },
    { group: 'help', slug: 'faq' },
  ],

  pendingApprovals: [
    'The full range of pull-up sizes offered',
    'Stand type, whether a stand is supplied as standard, and any carry case',
    'Banner media specification and print method',
    'Price or price range, with and without a stand',
    'Replacement-print service for an existing stand',
    'Minimum quantity, if any',
    'Turnaround',
  ],
}
