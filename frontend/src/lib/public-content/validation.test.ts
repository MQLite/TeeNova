import { describe, expect, it } from 'vitest'
import { evaluatePublication, findPlaceholders } from './validation'
import type { ApprovalRequirement, PublicContentDocument } from './types'

/**
 * Jira 10303 — the publication gate must be mechanical. These fixtures are test-only content: no
 * fixture text is ever exported to the site, so exercising the gate never risks publishing invented
 * policy wording.
 */

const TODAY = new Date('2026-08-05T00:00:00Z')

function fixture(overrides: Partial<PublicContentDocument> = {}): PublicContentDocument {
  return {
    group: 'help',
    slug: 'fixture-document',
    title: 'Fixture document',
    description: 'A test-only document used to exercise the publication gate.',
    classification: 'Customer help',
    status: 'published',
    approvalRequirement: 'none',
    lastReviewedAt: '2026-08-01',
    sections: [
      {
        id: 'first-section',
        heading: 'First section',
        status: 'published',
        factBasis: 'implemented-code',
        evidenceReference: 'test/fixture',
        blocks: [{ kind: 'paragraph', text: 'A factual statement with no unresolved wording.' }],
      },
    ],
    ...overrides,
  }
}

const approvalFixture = (requirement: ApprovalRequirement, extra: Partial<PublicContentDocument> = {}) =>
  fixture({ approvalRequirement: requirement, ...extra })

describe('publication gate', () => {
  it('publishes a complete document', () => {
    const result = evaluatePublication(fixture(), TODAY)
    expect(result.publishable).toBe(true)
    expect(result.publishedSections).toHaveLength(1)
    expect(result.problems).toEqual([])
  })

  it('never publishes a draft document', () => {
    const result = evaluatePublication(fixture({ status: 'draft' }), TODAY)
    expect(result.publishable).toBe(false)
    expect(result.publishedSections).toEqual([])
    expect(result.problems).toContain('document status is draft')
  })

  it('returns no sections at all when any check fails', () => {
    // A partially valid document must not leak its valid sections.
    const result = evaluatePublication(fixture({ lastReviewedAt: undefined }), TODAY)
    expect(result.publishable).toBe(false)
    expect(result.publishedSections).toEqual([])
  })

  it('requires an approval reference when owner approval is required', () => {
    const result = evaluatePublication(
      approvalFixture('owner', { approvedAt: '2026-08-01' }),
      TODAY,
    )
    expect(result.publishable).toBe(false)
    expect(result.problems.some((problem) => problem.includes('approval reference required'))).toBe(true)
  })

  it('requires an approval reference when legal approval is required', () => {
    const result = evaluatePublication(
      approvalFixture('legal', { approvedAt: '2026-08-01' }),
      TODAY,
    )
    expect(result.publishable).toBe(false)
    expect(result.problems.some((problem) => problem.includes('approval reference required'))).toBe(true)
  })

  it('requires an approval reference when owner and legal approval are required', () => {
    const result = evaluatePublication(
      approvalFixture('owner-and-legal', { approvedAt: '2026-08-01' }),
      TODAY,
    )
    expect(result.publishable).toBe(false)
    expect(result.problems.some((problem) => problem.includes('approval reference required'))).toBe(true)
  })

  it('accepts an approved document that carries both a reference and an approval date', () => {
    const result = evaluatePublication(
      approvalFixture('owner-and-legal', {
        approvalReference: 'APPROVAL-RECORD-2026-08-01',
        approvedAt: '2026-08-01',
      }),
      TODAY,
    )
    expect(result.publishable).toBe(true)
  })

  it('rejects an approval reference that is only whitespace', () => {
    const result = evaluatePublication(
      approvalFixture('owner', { approvalReference: '   ', approvedAt: '2026-08-01' }),
      TODAY,
    )
    expect(result.publishable).toBe(false)
  })

  it('rejects a missing or future approval date', () => {
    const missing = evaluatePublication(
      approvalFixture('owner', { approvalReference: 'REF-1' }),
      TODAY,
    )
    expect(missing.problems).toContain('a valid recorded approval date is required')

    const future = evaluatePublication(
      approvalFixture('owner', { approvalReference: 'REF-1', approvedAt: '2026-09-01' }),
      TODAY,
    )
    expect(future.problems).toContain('a valid recorded approval date is required')
  })

  it('rejects an invalid or future last-reviewed date', () => {
    expect(evaluatePublication(fixture({ lastReviewedAt: '05/08/2026' }), TODAY).problems)
      .toContain('a valid last-reviewed date is required')
    expect(evaluatePublication(fixture({ lastReviewedAt: '2026-02-31' }), TODAY).problems)
      .toContain('a valid last-reviewed date is required')
    expect(evaluatePublication(fixture({ lastReviewedAt: '2026-12-01' }), TODAY).problems)
      .toContain('a valid last-reviewed date is required')
  })

  it('rejects an invalid effective-from date', () => {
    expect(evaluatePublication(fixture({ effectiveFrom: 'next Monday' }), TODAY).problems)
      .toContain('effective-from date is invalid')
    // A future effective date is legitimate; only malformed values are rejected.
    expect(evaluatePublication(fixture({ effectiveFrom: '2027-01-01' }), TODAY).publishable).toBe(true)
  })

  it('rejects a document with no published sections', () => {
    const result = evaluatePublication(
      fixture({
        sections: [
          {
            id: 'unapproved',
            heading: 'Unapproved',
            status: 'draft',
            factBasis: 'owner-approved',
            blocks: [{ kind: 'paragraph', text: 'Awaiting a business decision.' }],
          },
        ],
      }),
      TODAY,
    )
    expect(result.publishable).toBe(false)
    expect(result.problems).toContain('no published sections')
  })

  it('requires every published section to name its evidence', () => {
    const result = evaluatePublication(
      fixture({
        sections: [
          {
            id: 'first-section',
            heading: 'First section',
            status: 'published',
            factBasis: 'owner-approved',
            blocks: [{ kind: 'paragraph', text: 'An operational statement.' }],
          },
        ],
      }),
      TODAY,
    )
    expect(result.publishable).toBe(false)
    expect(result.problems.some((problem) => problem.includes('no evidence or approval reference'))).toBe(true)
  })

  it('rejects malformed slugs and section anchors', () => {
    expect(evaluatePublication(fixture({ slug: 'Not A Slug' }), TODAY).problems)
      .toContain('slug must be lower-case kebab-case')
    expect(
      evaluatePublication(
        fixture({
          sections: [
            {
              id: 'Bad Anchor',
              heading: 'Heading',
              status: 'published',
              factBasis: 'implemented-code',
              evidenceReference: 'test/fixture',
              blocks: [{ kind: 'paragraph', text: 'Text.' }],
            },
          ],
        }),
        TODAY,
      ).publishable,
    ).toBe(false)
  })

  it('rejects duplicate section anchors', () => {
    const section = {
      id: 'same-anchor',
      heading: 'Heading',
      status: 'published' as const,
      factBasis: 'implemented-code' as const,
      evidenceReference: 'test/fixture',
      blocks: [{ kind: 'paragraph' as const, text: 'Text.' }],
    }
    const result = evaluatePublication(fixture({ sections: [section, { ...section }] }), TODAY)
    expect(result.problems).toContain('section anchors must be unique')
  })
})

describe('placeholder rejection', () => {
  const markers = [
    'TODO: confirm this',
    'Turnaround is TBD',
    'Delivery cost TBC',
    'Lorem ipsum dolor sit amet',
    'Insert policy here',
    'Ask owner about this',
    'Draft wording follows',
    'Legal review required before release',
    'Example only, not final',
    'Placeholder text',
    'Charges are {{ surcharge }} per order',
    'We reply within [number] days',
    'Reference XXX',
    'Coming soon',
  ]

  it.each(markers)('blocks publication when published text contains %s', (text) => {
    const result = evaluatePublication(
      fixture({
        sections: [
          {
            id: 'first-section',
            heading: 'First section',
            status: 'published',
            factBasis: 'implemented-code',
            evidenceReference: 'test/fixture',
            blocks: [{ kind: 'paragraph', text }],
          },
        ],
      }),
      TODAY,
    )
    expect(result.publishable).toBe(false)
    expect(result.problems.some((problem) => problem.startsWith('placeholder content present'))).toBe(true)
  })

  it('scans headings, descriptions, list items, tables and notices', () => {
    expect(findPlaceholders(['A clean heading'])).toEqual([])
    expect(findPlaceholders(['Rows are TBC'])).toContain('tbc')
    expect(findPlaceholders(['Cost is {{price}}'])).toContain('{{price}}')
  })

  it('ignores placeholder markers that only appear in unpublished sections', () => {
    const result = evaluatePublication(
      fixture({
        sections: [
          {
            id: 'first-section',
            heading: 'First section',
            status: 'published',
            factBasis: 'implemented-code',
            evidenceReference: 'test/fixture',
            blocks: [{ kind: 'paragraph', text: 'A factual statement.' }],
          },
          {
            id: 'held-back',
            heading: 'Held back',
            status: 'draft',
            factBasis: 'owner-approved',
            blocks: [{ kind: 'paragraph', text: 'TODO: get the owner to confirm this.' }],
          },
        ],
      }),
      TODAY,
    )
    expect(result.publishable).toBe(true)
  })

  it('does not flag ordinary prose that merely contains a marker as a substring', () => {
    expect(findPlaceholders(['There is nothing left to double-check.'])).toEqual([])
    expect(findPlaceholders(['We will place holders on the rack.'])).toEqual([])
  })
})
