import type { PublicContentDocument } from '@/lib/public-content/types'

/**
 * Garment care instructions (Jira 10303).
 *
 * Care requirements depend on fabric, print method, transfer material and decoration type. The
 * product model carries none of those, so no washing, drying or ironing instruction can be derived
 * and none is invented. Generic garment claims removed under Jira 10302 are not reintroduced.
 *
 * The document stays Draft until owner-approved instructions exist, and those instructions should
 * be recorded against the print method or fabric they apply to rather than as one universal rule.
 */
export const garmentCareDocument: PublicContentDocument = {
  group: 'help',
  slug: 'garment-care',
  title: 'Caring for printed garments',
  description: 'Looking after a printed garment so the print lasts.',
  classification: 'Customer help',
  status: 'draft',
  approvalRequirement: 'owner',
  draftReason:
    'No approved care instructions exist. Care depends on fabric, print method and transfer material, none of which the product model records, so no universal instruction can be published.',
  related: [{ group: 'help', slug: 'size-guide' }],
  sections: [
    {
      id: 'why-care-varies',
      heading: 'Why care instructions vary',
      status: 'draft',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/types/index.ts (Product, ProductVariant)',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The catalogue records a product, its colours and its size labels. It does not record fabric composition, print method or transfer material, so the site cannot tell you which care instruction applies to the garment you bought.',
        },
      ],
    },
    {
      id: 'washing',
      heading: 'Washing',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Wash temperature, inside-out washing, detergent choice and bleach guidance require owner approval and must be recorded per print method rather than as one rule.',
        },
      ],
    },
    {
      id: 'drying-and-ironing',
      heading: 'Drying and ironing',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Tumble drying, line drying, ironing temperature, ironing over a print and dry cleaning all require owner approval.',
        },
      ],
    },
    {
      id: 'first-wash',
      heading: 'The first wash',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Any advice about waiting before the first wash, or about curing time for a particular print method, requires owner approval.',
        },
      ],
    },
    {
      id: 'customer-supplied-garments',
      heading: 'Garments you supply',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Care advice for a garment you supplied depends on that garment’s own label as well as the print method used, and requires owner approval before it is published.',
        },
      ],
    },
  ],
}
