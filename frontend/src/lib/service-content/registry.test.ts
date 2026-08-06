import { describe, expect, it } from 'vitest'
import { SERVICE_OPTIONS } from '@/app/quote/quote-form-validation'
import { publishedDocuments } from '@/lib/public-content/registry'
import { serviceApprovalReport } from './approval-report'
import {
  allServices,
  findService,
  isServicePublished,
  publishedHelpLinks,
  publishedServices,
  resolveService,
  serviceHref,
} from './registry'

/** Jira 10306 — the registry that decides what may appear anywhere public. */

const REQUIRED_SLUGS = [
  'custom-garment-printing',
  'bring-your-own-garment',
  'custom-round-button-badges',
  'pvc-banners',
  'pull-up-banners',
  'business-cards',
  'stickers-and-labels',
  'signage',
]

describe('service registry', () => {
  it('defines every service the task requires', () => {
    for (const slug of REQUIRED_SLUGS) {
      expect(findService(slug), `missing service definition: ${slug}`).toBeDefined()
    }
  })

  it('has unique slugs and unique sort orders', () => {
    const slugs = allServices.map((service) => service.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    const orders = allServices.map((service) => service.sortOrder)
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('maps every service onto a valid Jira 10301 quote classification', () => {
    const valid = new Set(SERVICE_OPTIONS.map((option) => option.value))
    for (const service of allServices) {
      expect(valid.has(service.quoteServiceType), `${service.slug} → ${service.quoteServiceType}`).toBe(true)
    }
  })

  it('uses the same classification for the portfolio filter as for the quote link', () => {
    for (const service of allServices) {
      if (service.portfolioServiceType) {
        expect(service.portfolioServiceType).toBe(service.quoteServiceType)
      }
    }
  })

  it('publishes only services that pass the gate, in deterministic order', () => {
    const published = publishedServices()
    expect(published.map((service) => service.slug)).toEqual(
      [...published].sort((a, b) => a.sortOrder - b.sortOrder).map((service) => service.slug),
    )
    for (const service of published) {
      expect(isServicePublished(service)).toBe(true)
    }
  })

  it('reports every publication problem for any service that does not publish', () => {
    // Not an assertion that everything publishes — an assertion that a failure is explained rather
    // than silently swallowed, so the evidence document can state the reason.
    for (const row of serviceApprovalReport()) {
      if (row.publicStatus === 'Draft') expect(row.problems.length).toBeGreaterThan(0)
      else expect(row.problems).toEqual([])
    }
  })

  it('builds hrefs under /services', () => {
    expect(serviceHref({ slug: 'signage' })).toBe('/services/signage')
  })

  it('resolves an unknown slug to nothing', () => {
    expect(resolveService('not-a-service')).toBeUndefined()
    expect(resolveService('not-a-service', { allowDraftPreview: true })).toBeUndefined()
  })

  it('only ever links help documents that are themselves published', () => {
    const publishedHelpRoutes = new Set(
      publishedDocuments().map((document) => `/${document.group}/${document.slug}`),
    )
    for (const service of allServices) {
      for (const document of publishedHelpLinks(service)) {
        expect(publishedHelpRoutes.has(`/${document.group}/${document.slug}`)).toBe(true)
      }
    }
  })
})

describe('approval report', () => {
  it('never invents an approval reference', () => {
    for (const row of serviceApprovalReport()) {
      expect(row.approvalReference).toBeNull()
    }
  })

  it('records the commercial facts each service still needs', () => {
    for (const row of serviceApprovalReport()) {
      expect(row.pendingApprovals.length).toBeGreaterThan(0)
    }
  })

  it('publishes no price, minimum, turnaround, garment specification, stock or assurance anywhere', () => {
    for (const row of serviceApprovalReport()) {
      for (const key of [
        'price',
        'minimumQuantity',
        'turnaround',
        'garmentSpecification',
        'stockExpectation',
        'serviceAssurance',
      ] as const) {
        expect(row.publishedFacts, `${row.slug} published ${key}`).not.toContain(key)
        expect(row.omittedFacts).toContain(key)
      }
    }
  })
})
