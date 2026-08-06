/**
 * Typed approval registry for service content (Jira 10306).
 *
 * Generated from the definitions rather than maintained by hand, so the evidence document and the
 * code cannot disagree about which service publishes what. Nothing here is rendered publicly:
 * approval references, evidence paths and pending-approval lists are internal review material.
 */

import { allServices, isServicePublished } from './registry'
import { evaluateServicePublication, factProblems } from './validation'
import type { ServiceFactKey, ServicePageDefinition } from './types'

const FACT_KEYS: readonly ServiceFactKey[] = [
  'sizes',
  'materials',
  'finishes',
  'minimumQuantity',
  'price',
  'turnaround',
  'artworkSpecification',
  'garmentSpecification',
  'stockExpectation',
  'serviceAssurance',
]

export interface ServiceApprovalRow {
  slug: string
  name: string
  route: string
  status: ServicePageDefinition['status']
  approvalRequirement: ServicePageDefinition['approvalRequirement']
  approvalReference: string | null
  publishedSections: number
  totalSections: number
  publishedFacts: ServiceFactKey[]
  omittedFacts: ServiceFactKey[]
  publishedFaqs: number
  totalFaqs: number
  pendingApprovals: string[]
  publicStatus: 'Published' | 'Draft'
  problems: string[]
}

export function serviceApprovalReport(today: Date = new Date()): ServiceApprovalRow[] {
  return allServices.map((service) => {
    const evaluation = evaluateServicePublication(service, today)
    const publishedFacts = FACT_KEYS.filter((key) => {
      const fact = service.facts[key]
      return Boolean(fact) && factProblems(key, fact!, today).length === 0
    })
    return {
      slug: service.slug,
      name: service.name,
      route: `/services/${service.slug}`,
      status: service.status,
      approvalRequirement: service.approvalRequirement,
      approvalReference: service.approvalReference?.trim() || null,
      publishedSections: service.sections.filter((section) => section.status === 'published').length,
      totalSections: service.sections.length,
      publishedFacts,
      omittedFacts: FACT_KEYS.filter((key) => !publishedFacts.includes(key)),
      publishedFaqs: service.faqs.filter((entry) => entry.status === 'published').length,
      totalFaqs: service.faqs.length,
      pendingApprovals: service.pendingApprovals ?? [],
      publicStatus: isServicePublished(service) ? 'Published' : 'Draft',
      problems: evaluation.problems,
    }
  })
}
