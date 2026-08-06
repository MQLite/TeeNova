import { describe, expect, it } from 'vitest'
import { approvalRegistry } from './approval-report'
import {
  allPublicContentDocuments,
  documentsInGroup,
  findDocument,
  isPublished,
  publicContentHref,
  publishedDocuments,
  publishedRelatedLinks,
  resolvePublicDocument,
} from './registry'
import { approvedSizeCharts, publishedSizeCharts } from './size-charts'
import { evaluatePublication } from './validation'

/**
 * Jira 10303 — registry-level guarantees. These assert the mechanism, not the wording: the wording
 * assertions live in `src/content/public-content-accuracy.test.ts`.
 */

const REQUIRED_DOCUMENTS: { group: 'help' | 'policies'; slug: string }[] = [
  { group: 'help', slug: 'artwork-requirements' },
  { group: 'help', slug: 'turnaround' },
  { group: 'help', slug: 'delivery-and-pickup' },
  { group: 'help', slug: 'faq' },
  { group: 'help', slug: 'size-guide' },
  { group: 'help', slug: 'garment-care' },
  { group: 'policies', slug: 'privacy' },
  { group: 'policies', slug: 'returns' },
  { group: 'policies', slug: 'payment-terms' },
  { group: 'policies', slug: 'terms' },
]

describe('content registry', () => {
  it('defines all ten policy and help documents', () => {
    expect(allPublicContentDocuments).toHaveLength(10)
    for (const required of REQUIRED_DOCUMENTS) {
      expect(findDocument(required.group, required.slug)).toBeDefined()
    }
  })

  it('keeps slugs unique within each group', () => {
    for (const group of ['help', 'policies'] as const) {
      const slugs = documentsInGroup(group).map((document) => document.slug)
      expect(new Set(slugs).size).toBe(slugs.length)
    }
  })

  it('states the group each document belongs to consistently with its registry entry', () => {
    for (const group of ['help', 'policies'] as const) {
      for (const document of documentsInGroup(group)) expect(document.group).toBe(group)
    }
  })

  it('builds hrefs from the group and slug', () => {
    expect(publicContentHref({ group: 'policies', slug: 'privacy' })).toBe('/policies/privacy')
  })

  it('keeps every policy document unpublished until it is approved', () => {
    for (const document of documentsInGroup('policies')) {
      expect(isPublished(document)).toBe(false)
      expect(document.status).toBe('draft')
    }
  })

  it('publishes only documents whose statements come from implemented behaviour', () => {
    const published = publishedDocuments().map((document) => `${document.group}/${document.slug}`)
    expect(published).toEqual(['help/artwork-requirements', 'help/faq'])
  })

  it('never reports a document as publishable while the gate finds a problem', () => {
    for (const document of allPublicContentDocuments) {
      const evaluation = evaluatePublication(document)
      expect(isPublished(document)).toBe(evaluation.problems.length === 0)
    }
  })

  it('records a stated reason for every unpublished document', () => {
    for (const document of allPublicContentDocuments) {
      if (isPublished(document)) continue
      expect(document.draftReason?.trim()).toBeTruthy()
    }
  })
})

describe('resolving a document for a request', () => {
  it('resolves a published document without a draft banner', () => {
    const resolved = resolvePublicDocument('help', 'artwork-requirements')
    expect(resolved?.isDraftPreview).toBe(false)
    expect(resolved?.sections.every((section) => section.status === 'published')).toBe(true)
  })

  it('resolves nothing for a draft document when preview is not allowed', () => {
    expect(resolvePublicDocument('policies', 'privacy')).toBeUndefined()
    expect(resolvePublicDocument('help', 'turnaround')).toBeUndefined()
  })

  it('resolves nothing for an unknown slug even in preview mode', () => {
    expect(resolvePublicDocument('help', 'not-a-page', { allowDraftPreview: true })).toBeUndefined()
    expect(resolvePublicDocument('policies', 'refunds', { allowDraftPreview: true })).toBeUndefined()
  })

  it('marks a draft as a preview and still withholds its unapproved sections', () => {
    const resolved = resolvePublicDocument('policies', 'privacy', { allowDraftPreview: true })
    expect(resolved?.isDraftPreview).toBe(true)
    // Every privacy section is draft today, so a preview shows the shell and no policy wording.
    expect(resolved?.sections).toEqual([])
  })
})

describe('related links', () => {
  it('only ever points at published documents', () => {
    for (const document of allPublicContentDocuments) {
      for (const target of publishedRelatedLinks(document)) {
        expect(isPublished(target)).toBe(true)
      }
    }
  })

  it('drops related links whose target is still draft', () => {
    const sizeGuide = findDocument('help', 'size-guide')!
    expect(sizeGuide.related?.length).toBeGreaterThan(0)
    expect(publishedRelatedLinks(sizeGuide)).toEqual([])
  })

  it('never links a document to itself', () => {
    for (const document of allPublicContentDocuments) {
      expect(publishedRelatedLinks(document)).not.toContain(document)
    }
  })
})

describe('approval registry report', () => {
  it('reports one row per document with no fabricated approval reference', () => {
    const rows = approvalRegistry()
    expect(rows).toHaveLength(10)
    for (const row of rows) {
      // No approval record exists anywhere yet; inventing one would be the failure mode.
      expect(row.approvalReference).toBeNull()
      if (row.publicStatus === 'draft') expect(row.blockers.length).toBeGreaterThan(0)
      else expect(row.blockers).toEqual([])
    }
  })

  it('marks privacy, returns and payment terms as needing owner and legal approval', () => {
    const rows = approvalRegistry()
    for (const slug of ['privacy', 'returns', 'payment-terms']) {
      const row = rows.find((candidate) => candidate.slug === slug)!
      expect(row.ownerApprovalRequired).toBe(true)
      expect(row.legalApprovalRequired).toBe(true)
      expect(row.publicStatus).toBe('draft')
    }
    const terms = rows.find((row) => row.slug === 'terms')!
    expect(terms.legalApprovalRequired).toBe(true)
    expect(terms.publicStatus).toBe('draft')
  })
})

describe('garment size charts', () => {
  it('ships no measurements at all', () => {
    expect(approvedSizeCharts).toEqual([])
    expect(publishedSizeCharts()).toEqual([])
  })
})
