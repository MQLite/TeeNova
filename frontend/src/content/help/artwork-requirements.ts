import type { PublicContentDocument } from '@/lib/public-content/types'

/**
 * Artwork and file requirements (Jira 10303).
 *
 * Published sections state only what the current branch actually does: the accepted file types,
 * the configured size and count limits, where each kind of upload is stored, and the fact that no
 * malware scanner exists. Every published section names the source file it was derived from.
 *
 * Print-production preferences (resolution, bleed, colour mode, vector artwork, proofing, artwork
 * charges, colour matching) are business decisions the code cannot answer. They are held as Draft
 * sections below so the page can be completed by approval rather than rewritten.
 */
export const artworkRequirementsDocument: PublicContentDocument = {
  group: 'help',
  slug: 'artwork-requirements',
  title: 'Artwork and file requirements',
  description:
    'The file types, sizes and upload limits Otahuhu Printing accepts, and how your artwork files are stored.',
  classification: 'Customer help',
  status: 'published',
  // Every published section is derived from implemented behaviour rather than a business decision,
  // so no owner or legal approval record gates publication. Sections that do depend on a business
  // decision are Draft and are not rendered.
  approvalRequirement: 'none',
  lastReviewedAt: '2026-08-05',
  related: [{ group: 'help', slug: 'faq' }],
  sections: [
    {
      id: 'accepted-files',
      heading: 'File types we accept',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference:
        'backend/src/TeeNova.Domain/Enquiries/QuoteRequestOptions.cs; backend/src/TeeNova.Application/Files/FileAppService.cs',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Both the quote form and the product design upload accept the same set of file formats: PNG, JPEG (.jpg or .jpeg), WebP, PDF and Adobe Illustrator (.ai).',
        },
        {
          kind: 'paragraph',
          text:
            'SVG files are not accepted anywhere on the site. An uploaded file must also match the format it claims to be: the file extension and the file type reported by your browser have to agree, and image and PDF uploads are checked against the actual content of the file. Renaming a file to a different extension will not get it through.',
        },
      ],
    },
    {
      id: 'size-limits',
      heading: 'Size and quantity limits',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference:
        'backend/src/TeeNova.Domain/Enquiries/QuoteRequestOptions.cs; backend/src/TeeNova.Application/Files/FileAppService.cs',
      blocks: [
        {
          kind: 'table',
          caption: 'Current upload limits by upload type',
          columns: ['Upload', 'Maximum per file', 'Maximum per request', 'Maximum number of files'],
          rows: [
            ['Quote form artwork', '20 MB', '60 MB in total', '5 files'],
            ['Product design upload', '20 MB', '20 MB per file', 'One design per print position'],
          ],
        },
        {
          kind: 'paragraph',
          text:
            'These are the limits configured for the site today. If your artwork is larger than the limit, contact us and we will arrange another way to send it.',
        },
      ],
    },
    {
      id: 'quote-artwork-storage',
      heading: 'How quote artwork is stored',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference:
        'backend/src/TeeNova.Domain/Enquiries/PrivateStorage/LocalQuotePrivateObjectStorage.cs; backend/src/TeeNova.HttpApi/Enquiries/QuoteRequestController.cs',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Artwork attached to a quote request is written to private storage that sits outside the public website folder. No public web address is created for it, and there is no anonymous way to download it. Only a signed-in staff administrator can open the file, through an authenticated route that serves it as a download and does not allow it to be cached.',
        },
        {
          kind: 'paragraph',
          text:
            'Files you attach before submitting are held as staged uploads. If you never complete the form, the staged file expires and a background job removes it.',
        },
      ],
    },
    {
      id: 'design-upload-storage',
      heading: 'How product design uploads are stored',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference: 'backend/src/TeeNova.Domain/Files/LocalFileStorageService.cs',
      blocks: [
        {
          kind: 'notice',
          tone: 'caution',
          title: 'Product design uploads are not private storage',
          text:
            'A design uploaded from a product page or during checkout is saved into the website’s public uploads folder and is served as a static file. Anyone who has, or guesses, that file address can open it. Please do not upload confidential material through the product design upload. Quote form artwork is handled differently, in private storage.',
        },
      ],
    },
    {
      id: 'file-checks',
      heading: 'What we do and do not check',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference:
        'backend/src/TeeNova.Application/Enquiries/QuoteAttachmentService.cs; backend/src/TeeNova.Domain/Enquiries/QuoteRequestAttachment.cs',
      blocks: [
        {
          kind: 'list',
          items: [
            'We check the file extension against the accepted list.',
            'We check that the file type your browser reports matches that extension.',
            'We check the internal signature of PNG, JPEG, WebP, PDF and Illustrator files so that the content matches the claimed format.',
            'We record the size and a checksum of every uploaded file.',
            'We do not run a virus or malware scanner over uploaded files. Quote attachments are recorded as not scanned, and that status is shown to staff exactly as it is.',
          ],
        },
      ],
    },
    {
      id: 'artwork-and-orders',
      heading: 'Uploading artwork does not place an order',
      status: 'published',
      factBasis: 'implemented-code',
      evidenceReference:
        'backend/src/TeeNova.Application/Enquiries/QuoteRequestAppService.cs; frontend/src/app/quote/QuoteFormClient.tsx',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Sending artwork with a quote request is an enquiry. It does not create an order, does not reserve stock, does not take payment and does not start production. We review the request and reply to you.',
        },
        {
          kind: 'paragraph',
          text:
            'Artwork uploaded during checkout is attached to the order you place and is reviewed by our team before printing.',
        },
      ],
    },
    // ── Draft sections below: business decisions the code cannot confirm ────────────────────────
    {
      id: 'resolution-and-colour',
      heading: 'Resolution, colour and bleed',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Preferred print resolution, bleed allowance, colour mode, vector artwork preference, font outlining and transparency handling are print-production decisions that require confirmation by Otahuhu Printing before they are stated publicly.',
        },
      ],
    },
    {
      id: 'proofing-and-charges',
      heading: 'Proofs, artwork fixes and colour matching',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Whether a proof is issued, whether production starts only after proof approval, what happens when supplied artwork is too low in resolution, whether artwork corrections are charged, and how closely printed colour can follow an on-screen colour all require confirmation before they are stated publicly.',
        },
      ],
    },
  ],
}
