import type { ServicePageDefinition } from '@/lib/service-content/types'

/**
 * PVC banners (Jira 10306).
 *
 * The material and finishing lists here are **not** a specification of what we stock or supply.
 * They are exactly the choices the implemented banner enquiry accepts, recorded as
 * `requestable-options` so the gate keeps them from being dressed up as a confirmed spec. Banner
 * dimensions, weights, print method, price and turnaround are absent.
 *
 * The two banner order paths are kept apart deliberately: a fixed-size banner product is priced and
 * ordered online, while a custom-quote banner product collects an enquiry and is never priced by
 * the site. Merging them would misstate what happens when a customer clicks through.
 */
export const pvcBannersService: ServicePageDefinition = {
  slug: 'pvc-banners',
  name: 'PVC banners',
  shortName: 'PVC banners',
  description:
    'Printed PVC banners for shops, events, churches and promotions. Tell us the size, material and finishing you need and we will confirm the price.',
  cardSummary:
    'Printed banners for shops, events and promotions — send us the size, material and finishing you need.',
  iconName: 'banner',
  sortOrder: 40,

  status: 'published',
  approvalRequirement: 'none',
  lastReviewedAt: '2026-08-06',

  quoteServiceType: 'Banners',
  portfolioServiceType: 'Banners',

  hero: {
    eyebrow: 'Printing service',
    headline: 'PVC banners',
    summary:
      'Send us the finished size you need, the banner material and the finishing, and attach your design. We confirm the price with you before anything is produced.',
  },

  sections: [
    {
      id: 'two-ways-to-order-a-banner',
      heading: 'Two ways to order a banner',
      kind: 'ordering',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Domain.Shared/Catalog/PricingModel.cs',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Banner products on this site behave in one of two ways, and the product page makes it clear which one you are looking at.',
        },
        {
          kind: 'definitions',
          items: [
            {
              term: 'Set sizes, ordered online',
              description:
                'The product offers a list of set sizes. You choose a size and a quantity, and the price comes back from our pricing service so you can add it to your cart.',
            },
            {
              term: 'Made to your size, quoted first',
              description:
                'The product collects your size, material, finishing, quantity and design and sends it to us as an enquiry. The site does not price it — we come back to you with the price.',
            },
          ],
        },
        {
          kind: 'notice',
          tone: 'info',
          title: 'A banner enquiry is not an order',
          text: 'Sending a banner enquiry does not create an order, does not hold anything and does not take a payment. It reaches us as a request we reply to.',
        },
      ],
    },
    {
      id: 'what-you-tell-us',
      heading: 'What you tell us about the banner',
      kind: 'quote-process',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Domain/Enquiries/BannerQuoteRequest.cs',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A banner enquiry records the finished width and height you want, the unit those measurements are in, how many banners you need, the material and the finishing. You can attach your design and add a note about colours or placement.',
        },
        {
          kind: 'paragraph',
          text: 'Measurements can be given in millimetres, centimetres or metres — whichever you have. If you are unsure of the exact size, tell us where the banner is going and we can work it out with you.',
        },
      ],
    },
    {
      id: 'artwork-for-banners',
      heading: 'Artwork for banners',
      kind: 'artwork',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/components/products/BannerProductDetail.tsx',
      blocks: [
        {
          kind: 'paragraph',
          text: 'You can attach your design to a banner enquiry along with a note about how it should be laid out. Accepted file types and size limits are set out on the artwork and file requirements page.',
        },
      ],
    },
  ],

  facts: {
    materials: {
      value: ['PVC banner', 'Mesh banner', 'Fabric banner', 'Pull-up banner', 'Another material you name'],
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Domain.Shared/Orders/BannerMaterial.cs',
      presentation: 'requestable-options',
      note: 'These are the material choices a banner enquiry can carry, so we know what you are asking for. Which of them suits your job is something we confirm with you.',
    },
    finishes: {
      value: ['Eyelets', 'Hemming', 'Pole pocket', 'Another finishing requirement you describe'],
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Domain/Enquiries/BannerQuoteRequest.cs',
      presentation: 'requestable-options',
      note: 'Finishing options a banner enquiry can carry. Tell us which you need and we will confirm what the job requires.',
    },
  },

  faqs: [
    {
      id: 'do-i-need-to-know-the-exact-size',
      question: 'Do I need to know the exact banner size?',
      answer:
        'A width, a height and a unit are needed for a made-to-size banner, because the size drives the job. If you are unsure, tell us where the banner is going and we can work the size out with you.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/app/quote/quote-form-validation.ts',
    },
    {
      id: 'can-i-order-a-banner-online',
      question: 'Can I order a banner online?',
      answer:
        'Only where a banner product lists set sizes — those are priced by our pricing service and can be added to your cart. A banner made to your own size is quoted first.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Domain.Shared/Catalog/PricingModel.cs',
    },
    {
      id: 'what-material-should-i-choose',
      question: 'Which banner material should I choose?',
      answer:
        'Tell us where the banner will be used and what you are asking for, and we will confirm which of the materials suits the job. The enquiry lets you name a material we have not listed.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Domain.Shared/Orders/BannerMaterial.cs',
    },
  ],

  relatedProductKinds: ['Banner'],
  relatedProductsHeading: 'Banner products in our catalogue',
  relatedProductsNote:
    'These are the banner products currently listed on the site. Each product page states what that product covers and how it is priced.',
  relatedHelpLinks: [
    { group: 'help', slug: 'artwork-requirements' },
    { group: 'help', slug: 'faq' },
  ],

  pendingApprovals: [
    'Banner material specifications (weight, coating, indoor or outdoor suitability)',
    'Maximum printable width and height',
    'Print method and ink',
    'Expected outdoor life',
    'Price or price range, including any per-square-metre rate',
    'Minimum quantity, if any',
    'Turnaround',
    'Whether hardware or installation is offered',
  ],
}
