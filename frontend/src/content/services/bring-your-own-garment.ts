import type { ServicePageDefinition } from '@/lib/service-content/types'

/**
 * Bring your own garment (Jira 10306).
 *
 * This page exists partly to fix a real defect: `/customize` advertised an unbuilt Design Studio as
 * "Bring Your Own Garment" from the homepage and the footer. Everything published here is the
 * enquiry contract that actually exists. What we can print on, how a customer-supplied garment is
 * handled if something goes wrong, how it should be prepared, what it costs and how long it takes
 * are all owner decisions and are absent, not softened.
 */
export const bringYourOwnGarmentService: ServicePageDefinition = {
  slug: 'bring-your-own-garment',
  name: 'Bring your own garment printing',
  shortName: 'bring your own garment',
  description:
    'Ask us about printing your design on a garment you already have. Sending the details is an enquiry — it is not an order and no payment is taken.',
  cardSummary:
    'Already have the T-shirt, hoodie or workwear? Send us the details and we can look at printing on it.',
  iconName: 'artwork',
  sortOrder: 20,

  status: 'published',
  approvalRequirement: 'none',
  lastReviewedAt: '2026-08-06',

  quoteServiceType: 'BringYourOwnGarment',
  portfolioServiceType: 'BringYourOwnGarment',

  hero: {
    eyebrow: 'Printing service',
    headline: 'Printing on a garment you already have',
    summary:
      'Send us what the garment is and what you want printed on it. We review the request and come back to you — nothing is ordered or charged by sending it.',
  },

  sections: [
    {
      id: 'how-to-ask',
      heading: 'How to ask about your own garment',
      kind: 'quote-process',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/app/quote/quote-form-validation.ts',
      blocks: [
        {
          kind: 'paragraph',
          text: 'This service is handled as a quote request rather than an online order, because what you are bringing us is not something the catalogue knows about. Send us the details and we will look at whether we can print it and what it would cost.',
        },
        {
          kind: 'list',
          items: [
            'What the garment is, and how many of them you have.',
            'What you want printed, and roughly where on the garment it should sit.',
            'Your artwork, if you already have a file — you can attach it to the request.',
            'A date you need it by, if there is one.',
            'Whether you would collect the job or want it delivered.',
          ],
        },
      ],
    },
    {
      id: 'what-sending-a-request-does',
      heading: 'What sending a request does',
      kind: 'quote-process',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Application/Enquiries/QuoteRequestAppService.cs',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A quote request is an enquiry and nothing else. It does not create an order, it does not hold any stock, it does not start production and it never takes a payment. You get a reference so we can both talk about the same request.',
        },
        {
          kind: 'notice',
          tone: 'info',
          title: 'Artwork you attach to a request is private',
          text: 'Files attached to a quote request are stored outside the public part of the site. They have no public address and can only be opened by signed-in staff. That is different from artwork attached while configuring a catalogue product, which is served publicly.',
        },
      ],
    },
    {
      id: 'what-we-need-to-check-first',
      heading: 'What we need to check before printing your garment',
      kind: 'quote-process',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Domain.Shared/Enquiries/QuoteServiceType.cs',
      blocks: [
        {
          kind: 'paragraph',
          text: 'We look at each customer-supplied garment before agreeing to print on it, so please treat the request as a question rather than a booking. Once we have seen what the garment is and what you want on it, we will tell you what we can do and confirm the price with you first.',
        },
      ],
    },
  ],

  facts: {},

  faqs: [
    {
      id: 'can-i-order-this-online',
      question: 'Can I order this online?',
      answer:
        'No. Printing on a garment you supply is handled as a quote request, because the garment is not a catalogue item we can price automatically.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/app/quote/quote-form-validation.ts',
    },
    {
      id: 'can-i-attach-artwork',
      question: 'Can I attach my artwork to the request?',
      answer:
        'Yes. A quote request accepts artwork files, and those files are stored privately rather than in the site’s public uploads folder.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Domain/Enquiries/QuoteRequestAttachment.cs',
    },
    {
      id: 'am-i-committed-once-i-send-it',
      question: 'Am I committed to anything once I send the request?',
      answer:
        'No. Sending a request does not place an order and takes no payment. We confirm the price with you before anything is produced.',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Application/Enquiries/QuoteRequestAppService.cs',
    },
  ],

  relatedHelpLinks: [
    { group: 'help', slug: 'artwork-requirements' },
    { group: 'help', slug: 'faq' },
  ],

  pendingApprovals: [
    'Which garment types and fabrics can be printed on',
    'How a customer-supplied garment should be prepared and what condition it must arrive in',
    'What happens if a customer-supplied garment is damaged during printing',
    'Price or price range for the service',
    'Turnaround',
    'Minimum quantity, if any',
  ],
}
