import type { PublicContentDocument } from '@/lib/public-content/types'

/**
 * Frequently asked questions (Jira 10303).
 *
 * Each question is a section, so the section gate decides question by question what the public
 * sees. Published answers are derived from implemented behaviour and name their source. Questions
 * whose answer is a business decision (pricing amounts, collection, delivery, sizing) stay Draft
 * and are not rendered.
 *
 * No structured data is emitted here. FAQ JSON-LD belongs to Jira 10308.
 */
export const faqDocument: PublicContentDocument = {
  group: 'help',
  slug: 'faq',
  title: 'Frequently asked questions',
  description:
    'Answers about requesting a quote, uploading artwork, accepted file types and how prices are worked out.',
  classification: 'Customer help',
  status: 'published',
  // As with the artwork page, every published answer restates implemented behaviour rather than a
  // business decision, so publication is not gated on an approval record. Owner-dependent answers
  // are Draft.
  approvalRequirement: 'none',
  lastReviewedAt: '2026-08-05',
  related: [{ group: 'help', slug: 'artwork-requirements' }],
  sections: [
    {
      id: 'how-do-i-request-a-quote',
      heading: 'How do I request a quote?',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/components/QuoteLink.tsx; frontend/src/lib/site-contact.ts',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Use the “Request a quote” link in the site header or footer. It takes you to the on-site quote form where that form is available, and otherwise opens an email to our contact address. Either way, tell us the product, quantity, size, the date you need it and whether you would prefer pickup or delivery, and attach your artwork if you have it.',
        },
      ],
    },
    {
      id: 'is-a-quote-an-order',
      heading: 'Is a quote an order?',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference:
        'backend/src/TeeNova.Application/Enquiries/QuoteRequestAppService.cs; backend/src/TeeNova.Domain/Enquiries/QuoteRequest.cs',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'No. A quote request is an enquiry. Submitting one does not create an order, does not reserve stock, does not take any payment and does not start production. We review your request and reply to you; anything after that is agreed separately.',
        },
      ],
    },
    {
      id: 'what-happens-after-i-submit-a-quote',
      heading: 'What happens after I submit a quote request?',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference:
        'backend/src/TeeNova.Application/Enquiries/QuoteReferenceGenerator.cs; backend/src/TeeNova.Application/Email/QuoteRequestEmailService.cs',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Your request is saved first and given a short reference, which is shown on the confirmation screen. Quote your reference if you contact us about it. We then send you an acknowledgement email and notify our team. If either email fails to send, your request is still recorded and staff can see that the notification failed.',
        },
        {
          kind: 'paragraph',
          text:
            'We do not publish a response deadline here. How quickly we reply is not something this page can promise.',
        },
      ],
    },
    {
      id: 'can-i-upload-artwork',
      heading: 'Can I upload artwork?',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference:
        'backend/src/TeeNova.Application/Enquiries/QuoteAttachmentService.cs; backend/src/TeeNova.Application/Files/FileAppService.cs',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Yes, in two places. The quote form takes up to five files, and those are held in private storage that has no public web address. A product page or checkout takes one design per print position, and those files are saved in the website’s public uploads folder. Please keep confidential material out of the product design upload.',
        },
      ],
    },
    {
      id: 'what-file-types-are-accepted',
      heading: 'What file types are accepted?',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference:
        'backend/src/TeeNova.Domain/Enquiries/QuoteRequestOptions.cs; backend/src/TeeNova.Application/Files/FileAppService.cs',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'PNG, JPEG, WebP, PDF and Adobe Illustrator files. SVG is not accepted. Quote attachments are limited to 20 MB per file, 60 MB in total and five files; a product design upload is limited to 20 MB.',
        },
      ],
    },
    {
      id: 'how-is-price-calculated',
      heading: 'How is the price worked out?',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference:
        'frontend/src/app/products/[id]/ProductConfiguratorClient.tsx; frontend/src/features/cart/useCartPricing.ts',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Every price on the site is calculated by our server, never in your browser. As you change colours, sizes, quantities and print positions the page asks the server for a fresh price, so what you see reflects the current pricing rules. The total is recalculated again when you add to the cart and once more at checkout before any payment is taken.',
        },
        {
          kind: 'paragraph',
          text:
            'Some products are quote-only. Those cannot be bought online and are directed to a quote request instead.',
        },
      ],
    },
    {
      id: 'can-i-print-on-my-own-garment',
      heading: 'Can I print on a garment I supply?',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/app/quote/quote-form-validation.ts',
      blocks: [
        {
          kind: 'paragraph',
          text:
            '“Bring your own garment” is one of the services you can choose when you request a quote. Tell us what the garment is, how many there are and what you want printed, and we will confirm whether we can print on it and what it will cost.',
        },
      ],
    },
    // ── Draft answers below: owner decisions the code cannot confirm ─────────────────────────────
    {
      id: 'can-i-collect-my-order',
      heading: 'Can I collect my order?',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Collection address, hours and process require owner confirmation before they are published.',
        },
      ],
    },
    {
      id: 'do-you-deliver',
      heading: 'Do you deliver?',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Delivery coverage, carriers, charges and timeframes require owner confirmation before they are published.',
        },
      ],
    },
    {
      id: 'how-do-i-choose-garment-sizes',
      heading: 'How do I choose garment sizes?',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The catalogue records size labels only, with no measurements behind them, so no sizing answer can be published until approved measurements exist for each garment.',
        },
      ],
    },
    {
      id: 'how-long-does-a-job-take',
      heading: 'How long does a job take?',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'No turnaround period has been approved, and none is stated. Ask us when you request a quote and we will tell you what is achievable for your job.',
        },
      ],
    },
  ],
}
