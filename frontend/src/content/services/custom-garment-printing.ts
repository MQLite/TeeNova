import type { ServicePageDefinition } from '@/lib/service-content/types'

/**
 * Custom garment printing (Jira 10306).
 *
 * Every published sentence restates behaviour the branch implements: the configurator's own steps,
 * the backend-authoritative pricing path, and the enquiry-only quote contract. No fabric, weight,
 * fit, print method, care instruction, stock expectation, turnaround or price appears — none of
 * those exist in the catalogue, and the ones removed by Jira 10304 are not reinstated here.
 */
export const customGarmentPrintingService: ServicePageDefinition = {
  slug: 'custom-garment-printing',
  name: 'Custom garment printing',
  shortName: 'garment printing',
  description:
    'Configure printed T-shirts, hoodies and other garments online — choose colours, sizes, print positions and artwork, with pricing calculated by our pricing service.',
  cardSummary:
    'Configure garment colours, sizes, print positions and artwork online, or ask us about a job that is not listed.',
  iconName: 'garment',
  sortOrder: 10,

  status: 'published',
  approvalRequirement: 'none',
  lastReviewedAt: '2026-08-06',

  quoteServiceType: 'GarmentPrinting',
  portfolioServiceType: 'GarmentPrinting',

  hero: {
    eyebrow: 'Printing service',
    headline: 'Custom garment printing',
    summary:
      'Pick the garment, the colours and sizes you need, choose where the print goes, and attach your artwork. Pricing is calculated by our pricing service as you configure.',
  },

  sections: [
    {
      id: 'what-you-can-configure',
      heading: 'What you can configure online',
      kind: 'service-overview',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/app/products/[id]/ProductConfiguratorClient.tsx',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Garment printing is configured on the product page itself. You select the garment colours you want, enter a quantity against each size in those colours, choose which print positions the job uses, and attach artwork for each position you selected.',
        },
        {
          kind: 'list',
          items: [
            'Several colours in one configuration, each with its own size quantities.',
            'Several print positions on the same garment, each with its own print size.',
            'A separate artwork file per print position, plus an optional note for that position.',
            'The same configuration on a phone or a desktop — the mobile journey is a five-step version of the same form.',
          ],
        },
        {
          kind: 'paragraph',
          text: 'Which print positions and print sizes are offered depends on the product you are configuring. The list you see is the list that product allows, not a catalogue-wide list.',
        },
      ],
    },
    {
      id: 'how-the-price-is-worked-out',
      heading: 'How the price is worked out',
      kind: 'ordering',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference:
        'backend/src/TeeNova.Application/Pricing (pricing service) via frontend/src/api/pricing.ts',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Nothing on this site works a garment price out in your browser. Every figure you see while configuring comes back from our pricing service, which is asked again whenever you change a colour, a size quantity, a print position or a print size.',
        },
        {
          kind: 'paragraph',
          text: 'The total combines the garment price for the sizes you chose with the printing price for the positions and print sizes you chose. Printing is priced against the total quantity in the configuration, so the same job at a larger quantity is not simply the small quantity multiplied up.',
        },
        {
          kind: 'notice',
          tone: 'info',
          title: 'Prices on a product page are a preview',
          text: 'A price shown while you configure is a preview of that configuration. The amount you are asked to pay is recalculated at checkout, and that recalculated figure is the one that applies.',
        },
      ],
    },
    {
      id: 'artwork',
      heading: 'Artwork for garment printing',
      kind: 'artwork',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/components/products/PrintSizeSelector.tsx',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Artwork is attached per print position rather than once per order, so a front print and a back print carry their own files and their own notes.',
        },
        {
          kind: 'notice',
          tone: 'caution',
          title: 'Design uploads on a product page are stored in a public folder',
          text: 'Artwork attached while configuring a product is saved to the site’s public uploads folder and is served as a static file. Please do not send confidential material through it. Artwork attached to a quote request is handled differently — it is stored privately and is not reachable without staff sign-in.',
        },
        {
          kind: 'paragraph',
          text: 'Accepted file types, size limits and what we do and do not check are set out in full on the artwork and file requirements page.',
        },
      ],
    },
    {
      id: 'asking-about-a-job-that-is-not-listed',
      heading: 'Asking about a job that is not listed',
      kind: 'quote-process',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Application/Enquiries/QuoteRequestAppService.cs',
      blocks: [
        {
          kind: 'paragraph',
          text: 'If the garment, quantity or print you need is not something you can configure online, send us the details instead. A quote request is an enquiry: it does not create an order, it does not hold stock, and it does not take a payment.',
        },
        {
          kind: 'list',
          items: [
            'Tell us the quantity you have in mind and what you want printed.',
            'Attach artwork if you have it — quote artwork is stored privately.',
            'Add a date you need the job by, if you have one.',
            'Say whether you would collect the job or want it delivered.',
          ],
        },
      ],
    },
  ],

  facts: {},

  faqs: [
    {
      id: 'can-i-order-garment-printing-online',
      question: 'Can I order garment printing online?',
      answer:
        'Yes, for the garments listed in the catalogue. You configure colours, sizes, print positions and artwork on the product page and add the configuration to your cart.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/app/products/[id]/ProductConfiguratorClient.tsx',
    },
    {
      id: 'can-i-print-more-than-one-position',
      question: 'Can I print in more than one position on the same garment?',
      answer:
        'Yes. You can select several print positions in one configuration, choose a print size for each, and attach separate artwork to each position.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/app/products/[id]/ProductConfiguratorClient.tsx',
    },
    {
      id: 'is-the-configurator-price-the-final-price',
      question: 'Is the price I see while configuring the price I pay?',
      answer:
        'The price you see is calculated by our pricing service for the configuration in front of you, and it is calculated again at checkout. The checkout figure is the one that applies.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/api/pricing.ts',
    },
    {
      id: 'what-does-a-quote-request-do',
      question: 'What happens when I send a quote request?',
      answer:
        'It reaches us as an enquiry. It is not an order, no stock is held and no payment is taken. We review it and come back to you about pricing.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Application/Enquiries/QuoteRequestAppService.cs',
    },
  ],

  relatedProductKinds: ['Garment'],
  relatedHelpLinks: [
    { group: 'help', slug: 'artwork-requirements' },
    { group: 'help', slug: 'faq' },
  ],

  pendingApprovals: [
    'Fabric composition, weight and fit per garment',
    'Print method per garment and print position',
    'Care instructions per fabric and print method',
    'Garment measurement chart per product',
    'Stock expectations',
    'Standard and rush turnaround',
    'Any published starting price or price range',
  ],
}
