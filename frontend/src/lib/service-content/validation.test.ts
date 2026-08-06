import { describe, expect, it } from 'vitest'
import { evaluateServicePublication, factProblems, faqProblems, renderableFacts } from './validation'
import type { ApprovedServiceFact, ServicePageDefinition } from './types'

/**
 * Jira 10306 — the service publication gate.
 *
 * Fixtures live only in this file and are never exported to the site. They exist to prove the gate
 * rejects the things it claims to reject, which is the only way "no unapproved commercial claim can
 * be published" is a property of the code rather than a promise from a reviewer.
 */

const TODAY = new Date('2026-08-06T00:00:00Z')

const LONG_PROSE =
  'Send us the details of the job you have in mind and we will look at what is involved. ' +
  'Sending a request is an enquiry: it does not create an order, it does not hold anything for you, ' +
  'and no payment is taken at that point. We reply with what we can do and confirm the price with you.'

function baseService(overrides: Partial<ServicePageDefinition> = {}): ServicePageDefinition {
  return {
    slug: 'test-service',
    name: 'Test service',
    shortName: 'test service',
    description: 'A service definition used only by tests.',
    cardSummary: 'A service definition used only by tests.',
    iconName: 'printer',
    sortOrder: 999,
    status: 'published',
    approvalRequirement: 'none',
    lastReviewedAt: '2026-08-01',
    quoteServiceType: 'Other',
    hero: {
      eyebrow: 'Printing service',
      headline: 'Test service',
      summary: 'A service definition used only by tests.',
    },
    sections: [
      {
        id: 'overview',
        heading: 'Overview',
        kind: 'quote-process',
        status: 'published',
        factBasis: 'implemented-code',
        evidenceReference: 'test fixture',
        blocks: [{ kind: 'paragraph', text: LONG_PROSE }],
      },
    ],
    facts: {},
    faqs: [],
    ...overrides,
  }
}

const problemsFor = (service: ServicePageDefinition): string[] =>
  evaluateServicePublication(service, TODAY).problems

describe('document-level gate', () => {
  it('publishes a definition that satisfies every rule', () => {
    const result = evaluateServicePublication(baseService(), TODAY)
    expect(result.publishable).toBe(true)
    expect(result.problems).toEqual([])
    expect(result.sections).toHaveLength(1)
  })

  it('treats draft as the safe state and returns nothing renderable', () => {
    const result = evaluateServicePublication(baseService({ status: 'draft' }), TODAY)
    expect(result.publishable).toBe(false)
    expect(result.sections).toEqual([])
    expect(result.facts).toEqual({})
    expect(result.faqs).toEqual([])
    expect(result.problems).toContain('service status is draft')
  })

  it('rejects an invalid slug', () => {
    expect(problemsFor(baseService({ slug: 'Test_Service' }))).toContain(
      'slug must be lower-case kebab-case',
    )
  })

  it('rejects an empty name or description', () => {
    expect(problemsFor(baseService({ name: '  ' }))).toContain('name is empty')
    expect(problemsFor(baseService({ description: '' }))).toContain('description is empty')
  })

  it('rejects an unknown quote service classification', () => {
    const service = baseService()
    ;(service as { quoteServiceType: string }).quoteServiceType = 'Fireworks'
    expect(problemsFor(service).join(' ')).toMatch(/not a valid quote service classification/)
  })

  it('rejects a portfolio filter that does not match the quote classification', () => {
    expect(problemsFor(baseService({ portfolioServiceType: 'Badges' }))).toContain(
      'the portfolio filter must use the same service classification as the quote link',
    )
  })

  it('requires an approval reference and date when approval is required', () => {
    const problems = problemsFor(baseService({ approvalRequirement: 'owner' }))
    expect(problems).toContain('approval reference required for "owner" approval')
    expect(problems).toContain('a valid recorded approval date is required')
  })

  it('rejects a future approval date', () => {
    const problems = problemsFor(
      baseService({
        approvalRequirement: 'owner',
        approvalReference: 'OWNER-2026-01',
        approvedAt: '2027-01-01',
      }),
    )
    expect(problems).toContain('a valid recorded approval date is required')
  })

  it('rejects a missing, malformed or future last-reviewed date', () => {
    for (const value of [undefined, '06/08/2026', '2027-01-01']) {
      const service = baseService()
      ;(service as { lastReviewedAt?: string }).lastReviewedAt = value as string
      expect(problemsFor(service)).toContain('a valid last-reviewed date is required')
    }
  })

  it('rejects duplicate and non-kebab section anchors', () => {
    const duplicated = baseService()
    duplicated.sections = [duplicated.sections[0], { ...duplicated.sections[0] }]
    expect(problemsFor(duplicated)).toContain('section anchors must be unique')

    const malformed = baseService()
    malformed.sections = [{ ...malformed.sections[0], id: 'Not Kebab' }]
    expect(problemsFor(malformed).join(' ')).toMatch(/must be lower-case kebab-case/)
  })

  it('rejects a published section with no evidence reference', () => {
    const service = baseService()
    service.sections = [{ ...service.sections[0], evidenceReference: '  ' }]
    expect(problemsFor(service)).toContain('section "overview" has no evidence or approval reference')
  })

  it('rejects an owner-approved section without a recorded approval date', () => {
    const service = baseService()
    service.sections = [
      { ...service.sections[0], kind: 'owner-statement', factBasis: 'owner-approved' },
    ]
    expect(problemsFor(service)).toContain('section "overview" needs a valid, non-future approval date')
  })

  it('will not let existing public content support a specification section', () => {
    const service = baseService()
    service.sections = [
      { ...service.sections[0], kind: 'ordering', factBasis: 'existing-public-content' },
    ]
    expect(problemsFor(service).join(' ')).toMatch(/rests on existing public content/)
  })

  it('rejects a page with no published section', () => {
    const service = baseService()
    service.sections = [{ ...service.sections[0], status: 'draft' }]
    expect(problemsFor(service)).toContain('no published sections')
  })

  it('rejects a page whose published content says almost nothing', () => {
    const service = baseService()
    service.sections = [{ ...service.sections[0], blocks: [{ kind: 'paragraph', text: 'We print.' }] }]
    expect(problemsFor(service)).toContain('no meaningful published content')
  })

  it('rejects a malformed related product id and an unknown product kind', () => {
    expect(problemsFor(baseService({ relatedProductIds: ['not-a-guid'] })).join(' ')).toMatch(
      /not a valid product identifier/,
    )
    const service = baseService()
    ;(service as { relatedProductKinds: string[] }).relatedProductKinds = ['Sticker']
    expect(problemsFor(service).join(' ')).toMatch(/not a valid product kind/)
  })

  it('rejects a link to a draft help document', () => {
    expect(
      problemsFor(baseService({ relatedHelpLinks: [{ group: 'help', slug: 'turnaround' }] })),
    ).toContain('help link /help/turnaround is draft')
  })

  it('rejects a link to a help document that does not exist', () => {
    expect(
      problemsFor(baseService({ relatedHelpLinks: [{ group: 'help', slug: 'nope' }] })),
    ).toContain('help link /help/nope does not exist')
  })

  it('accepts a link to a published help document', () => {
    const result = evaluateServicePublication(
      baseService({ relatedHelpLinks: [{ group: 'help', slug: 'artwork-requirements' }] }),
      TODAY,
    )
    expect(result.publishable).toBe(true)
  })
})

describe('placeholder and unsupported-claim scanning', () => {
  it('rejects Jira 10303 placeholder markers', () => {
    const service = baseService()
    service.sections = [
      { ...service.sections[0], blocks: [{ kind: 'paragraph', text: `${LONG_PROSE} Coming soon.` }] },
    ]
    expect(problemsFor(service).join(' ')).toMatch(/placeholder content present/)
  })

  it('rejects service-specific placeholder markers', () => {
    for (const marker of ['Starting from TBD', 'Ask for price', 'Sample price', 'Example product']) {
      const service = baseService()
      service.sections = [
        { ...service.sections[0], blocks: [{ kind: 'paragraph', text: `${LONG_PROSE} ${marker}.` }] },
      ]
      expect(problemsFor(service).join(' ')).toMatch(/placeholder content present/)
    }
  })

  it.each([
    ['a bare dollar amount', 'Badges start at $2 each.', /currency amount appears in prose/],
    ['an NZ dollar amount', 'Banners start at NZ$120.', /currency amount appears in prose/],
    ['a turnaround promise', 'Ready within 3 days.', /turnaround promise appears in prose/],
    ['a business-day promise', 'Printed in 5 business days.', /turnaround promise appears in prose/],
    ['a free delivery claim', 'We offer free shipping on every job.', /delivery claim appears in prose/],
    ['a coverage claim', 'We ship NZ wide.', /delivery claim appears in prose/],
    ['a GST claim', 'All prices are GST inclusive.', /GST claim appears in prose/],
    ['a guarantee', 'Every print is guaranteed.', /guarantee appears in prose/],
    ['a minimum quantity', 'There is a minimum order of 50.', /minimum quantity appears in prose/],
    ['a fabric claim', 'Printed on 180 gsm cotton.', /material or care specification/],
    ['a care claim', 'Machine washable at any temperature.', /material or care specification/],
    ['a stock claim', 'All sizes are always available.', /stock expectation appears in prose/],
  ])('rejects %s in prose', (_label, sentence, expected) => {
    const service = baseService()
    service.sections = [
      { ...service.sections[0], blocks: [{ kind: 'paragraph', text: `${LONG_PROSE} ${sentence}` }] },
    ]
    expect(problemsFor(service).join(' ')).toMatch(expected)
  })

  it('does not flag ordinary prose that merely mentions a topic', () => {
    const service = baseService()
    service.sections = [
      {
        ...service.sections[0],
        blocks: [
          {
            kind: 'paragraph',
            text:
              `${LONG_PROSE} We will confirm the price and the timing with you before anything is ` +
              'produced, and we can talk through materials and quantities when we know what the job needs.',
          },
        ],
      },
    ]
    expect(evaluateServicePublication(service, TODAY).publishable).toBe(true)
  })

  it('rejects internal paths, admin routes, email addresses and storage keys', () => {
    for (const leak of [
      'Files live in App_Data on the server.',
      'Staff open it at /admin/quote-requests.',
      'Email someone@example.com about it.',
      'The key is 0123456789abcdef0123456789abcdef.',
    ]) {
      const service = baseService()
      service.sections = [
        { ...service.sections[0], blocks: [{ kind: 'paragraph', text: `${LONG_PROSE} ${leak}` }] },
      ]
      expect(problemsFor(service).join(' ')).toMatch(/internal detail present/)
    }
  })
})

describe('field-level approval', () => {
  const evidenced = <T,>(value: T, overrides: Partial<ApprovedServiceFact<T>> = {}): ApprovedServiceFact<T> => ({
    value,
    status: 'published',
    factBasis: 'implemented-code',
    evidenceReference: 'test fixture',
    presentation: 'requestable-options',
    ...overrides,
  })

  it('omits a draft fact entirely', () => {
    const service = baseService({
      facts: { materials: evidenced(['PVC'], { status: 'draft' }) },
    })
    expect(renderableFacts(service, TODAY).materials).toBeUndefined()
    expect(evaluateServicePublication(service, TODAY).publishable).toBe(true)
  })

  it('rejects a published fact with no evidence reference', () => {
    expect(
      factProblems('materials', evidenced(['PVC'], { evidenceReference: '' }), TODAY).join(' '),
    ).toMatch(/no evidence reference/)
  })

  it('omits a price with no owner approval', () => {
    const fact = evidenced<{ kind: 'from'; currency: 'NZD'; amount: number }>(
      { kind: 'from', currency: 'NZD', amount: 25 },
      { presentation: 'confirmed-specification' },
    )
    expect(factProblems('price', fact, TODAY)).toContain('a price amount requires owner approval')
    expect(renderableFacts(baseService({ facts: { price: fact } }), TODAY).price).toBeUndefined()
  })

  it('accepts an owner-approved, dated, NZD price', () => {
    const fact = evidenced<{ kind: 'from'; currency: 'NZD'; amount: number }>(
      { kind: 'from', currency: 'NZD', amount: 25 },
      {
        factBasis: 'owner-approved',
        approvedAt: '2026-07-01',
        evidenceReference: 'OWNER-2026-07 price schedule',
        presentation: 'confirmed-specification',
      },
    )
    expect(factProblems('price', fact, TODAY)).toEqual([])
  })

  it('rejects a non-NZD price and an inverted range', () => {
    const owner = {
      factBasis: 'owner-approved' as const,
      approvedAt: '2026-07-01',
      presentation: 'confirmed-specification' as const,
    }
    expect(
      factProblems('price', evidenced({ kind: 'from', currency: 'AUD', amount: 5 }, owner), TODAY),
    ).toContain('service prices must be recorded in NZD')
    expect(
      factProblems(
        'price',
        evidenced({ kind: 'range', currency: 'NZD', minAmount: 50, maxAmount: 10 }, owner),
        TODAY,
      ),
    ).toContain('a price range must run from a lower to a higher amount')
  })

  it('accepts a quote-only price without an owner approval, because it states no amount', () => {
    expect(factProblems('price', evidenced({ kind: 'quote-only' }), TODAY)).toEqual([])
  })

  it('omits a turnaround with no owner approval', () => {
    expect(factProblems('turnaround', evidenced('Three days'), TODAY)).toContain(
      'turnaround requires owner approval',
    )
  })

  it('omits a service-wide minimum with no owner approval, and a product minimum with no product', () => {
    expect(
      factProblems('minimumQuantity', evidenced({ value: 50, scope: 'service-wide', unit: 'pieces' }), TODAY),
    ).toContain('a service-wide minimum requires owner approval')
    expect(
      factProblems('minimumQuantity', evidenced({ value: 50, scope: 'product', unit: 'pieces' }), TODAY),
    ).toContain('a product minimum must name the product it came from')
  })

  it('omits a garment specification without owner approval and product scope', () => {
    const problems = factProblems(
      'garmentSpecification',
      evidenced([{ label: 'Fabric', value: '100% cotton' }]),
      TODAY,
    )
    expect(problems).toContain('garment specifications require owner approval')
    expect(problems).toContain('a garment specification must be scoped to one product')
  })

  it('omits stock expectations and service assurances without owner approval', () => {
    expect(factProblems('stockExpectation', evidenced('Always in stock'), TODAY)).toContain(
      'stock expectations require owner approval',
    )
    expect(factProblems('serviceAssurance', evidenced('We never miss a date'), TODAY)).toContain(
      'service assurances require owner approval',
    )
  })

  it('will not let a materials or finish list be presented as a confirmed specification without approval', () => {
    expect(
      factProblems('materials', evidenced(['PVC'], { presentation: 'confirmed-specification' }), TODAY),
    ).toContain('materials is presented as a confirmed specification without owner approval')
    expect(
      factProblems('finishes', evidenced(['Eyelets'], { presentation: 'confirmed-specification' }), TODAY),
    ).toContain('finishes is presented as a confirmed specification without owner approval')
  })

  it('will not let existing public content support any commercial fact', () => {
    expect(
      factProblems('materials', evidenced(['PVC'], { factBasis: 'existing-public-content' }), TODAY).join(' '),
    ).toMatch(/may not rest on existing public content/)
  })

  it('rejects an empty option list', () => {
    expect(factProblems('sizes', evidenced<string[]>([]), TODAY)).toContain('sizes has no values')
  })
})

describe('service FAQ rules', () => {
  const entry = (overrides: Partial<Parameters<typeof faqProblems>[0]> = {}) => ({
    id: 'can-i-order-online',
    question: 'Can I order online?',
    answer: 'Yes, when the product is listed in the catalogue.',
    status: 'published' as const,
    factBasis: 'implemented-code' as const,
    evidenceReference: 'test fixture',
    ...overrides,
  })

  it('accepts a code-evidenced answer', () => {
    expect(faqProblems(entry(), TODAY)).toEqual([])
  })

  it('rejects a published answer with no evidence', () => {
    expect(faqProblems(entry({ evidenceReference: '' }), TODAY).join(' ')).toMatch(
      /has no evidence or approval reference/,
    )
  })

  it.each([
    ['turnaround', 'How long does it take?', 'About a week.'],
    ['delivery', 'Do you deliver?', 'We can arrange delivery.'],
    ['returns', 'Can I get a refund?', 'We will reprint it.'],
    ['guarantees', 'Is it guaranteed?', 'Yes, fully guaranteed.'],
    ['material performance', 'Will it fade?', 'It is very durable.'],
  ])('refuses to answer %s without owner approval', (topic, question, answer) => {
    expect(faqProblems(entry({ question, answer }), TODAY).join(' ')).toMatch(
      new RegExp(`answers ${topic}`),
    )
  })

  it('allows a restricted topic once the owner has approved and dated the answer', () => {
    expect(
      faqProblems(
        entry({
          question: 'Do you deliver?',
          answer: 'Yes, to the areas listed in our delivery policy.',
          factBasis: 'owner-approved',
          approvedAt: '2026-07-01',
          evidenceReference: 'OWNER-2026-07 delivery policy',
        }),
        TODAY,
      ),
    ).toEqual([])
  })

  it('blocks the whole page when a published FAQ answer breaks a rule', () => {
    const service = baseService({
      faqs: [entry({ question: 'How long does it take?', answer: 'About a week.' })],
    })
    const result = evaluateServicePublication(service, TODAY)
    expect(result.publishable).toBe(false)
    expect(result.faqs).toEqual([])
  })
})
