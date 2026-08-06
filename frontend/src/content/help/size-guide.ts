import type { PublicContentDocument } from '@/lib/public-content/types'
import type { GarmentSizeChart } from '@/lib/public-content/size-charts'
import { approvedSizeCharts } from '@/lib/public-content/size-charts'

/**
 * Garment size guide (Jira 10303).
 *
 * The catalogue stores a size label on each product variant and nothing else — no chest, body or
 * length measurement exists anywhere in the data model. A size label is not a measurement, so no
 * chart can be derived from the catalogue and none is invented.
 *
 * The content framework supports per-garment charts (see `approvedSizeCharts`), which Jira 10306
 * can link to specific products once the owner supplies measured charts. Until at least one chart
 * is approved the page stays Draft.
 */
export const sizeGuideDocument: PublicContentDocument = {
  group: 'help',
  slug: 'size-guide',
  title: 'Garment size guide',
  description: 'Measurements and fit information for the garments we print.',
  classification: 'Customer help',
  status: 'draft',
  approvalRequirement: 'owner',
  draftReason:
    'No approved garment measurements exist. The catalogue holds size labels only, and the measuring instructions and tolerance wording have not been approved either.',
  related: [{ group: 'help', slug: 'garment-care' }],
  sections: [
    {
      id: 'what-the-catalogue-records',
      heading: 'What the catalogue records today',
      status: 'draft',
      factBasis: 'implemented-code',
      evidenceReference: 'frontend/src/types/index.ts (ProductVariant.size)',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Each product variant carries a colour and a size label. There is no measurement, fabric weight, fit or brand field behind that label, so the site cannot show you a chart derived from the catalogue.',
        },
      ],
    },
    {
      id: 'per-garment-charts',
      heading: 'Charts are per garment',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Different garments and different brands size differently. When approved charts are supplied they will be attached to the specific garments they belong to, rather than presented as one chart covering everything we print.',
        },
      ],
    },
    {
      id: 'how-to-measure',
      heading: 'How to measure',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Measuring instructions, the measurement points used, the unit and the tolerance applied to a garment measurement all require owner approval before publication.',
        },
      ],
    },
    {
      id: 'youth-and-adult',
      heading: 'Youth and adult sizing',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Whether youth sizing is offered, and how it relates to adult sizing, requires owner approval.',
        },
      ],
    },
    {
      id: 'asking-us',
      heading: 'If you are unsure',
      status: 'draft',
      factBasis: 'owner-approved',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Until approved charts exist, ask us for the measurements of the specific garment before you order.',
        },
      ],
    },
  ],
}

/** Re-exported so Jira 10306 can bind approved charts to specific garments. */
export type { GarmentSizeChart }
export { approvedSizeCharts }
