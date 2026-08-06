/**
 * Content approval registry (Jira 10303, Phase 16).
 *
 * A typed report over every document: what the code can prove, which approvals are outstanding and
 * what the resulting public status is. Tests assert against it, and the evidence document's
 * approval table is generated from the same data rather than maintained by hand.
 */

import { allPublicContentDocuments } from './registry'
import type { ApprovalRequirement, PublicContentDocument, PublicContentGroup } from './types'
import { evaluatePublication } from './validation'

export interface ApprovalRegistryRow {
  group: PublicContentGroup
  slug: string
  title: string
  approvalRequirement: ApprovalRequirement
  ownerApprovalRequired: boolean
  legalApprovalRequired: boolean
  approvalReference: string | null
  /** Sections whose statements come from implemented code. */
  codeConfirmedSections: number
  /** Sections that need an owner or legal decision before they can be published. */
  approvalDependentSections: number
  publishedSections: number
  totalSections: number
  publicStatus: 'published' | 'draft'
  blockers: string[]
}

const ownerRequired = (requirement: ApprovalRequirement) =>
  requirement === 'owner' || requirement === 'owner-and-legal'

const legalRequired = (requirement: ApprovalRequirement) =>
  requirement === 'legal' || requirement === 'owner-and-legal'

export function approvalRow(document: PublicContentDocument): ApprovalRegistryRow {
  const evaluation = evaluatePublication(document)
  const blockers = evaluation.publishable
    ? []
    : [...evaluation.problems, ...(document.draftReason ? [document.draftReason] : [])]

  return {
    group: document.group,
    slug: document.slug,
    title: document.title,
    approvalRequirement: document.approvalRequirement,
    ownerApprovalRequired: ownerRequired(document.approvalRequirement),
    legalApprovalRequired: legalRequired(document.approvalRequirement),
    approvalReference: document.approvalReference?.trim() || null,
    codeConfirmedSections: document.sections.filter((s) => s.factBasis === 'implemented-code').length,
    approvalDependentSections: document.sections.filter(
      (s) => s.factBasis === 'owner-approved' || s.factBasis === 'legal-approved',
    ).length,
    publishedSections: evaluation.publishedSections.length,
    totalSections: document.sections.length,
    publicStatus: evaluation.publishable ? 'published' : 'draft',
    blockers,
  }
}

export const approvalRegistry = (): ApprovalRegistryRow[] =>
  allPublicContentDocuments.map(approvalRow)
