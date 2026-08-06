import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { allServices, publishedServices } from '@/lib/service-content/registry'
import { servicePublicText } from '@/lib/service-content/validation'
import { productTitleProposals, seedControlledProductNames } from './product-title-proposals'

/**
 * Jira 10306 — the published service content, checked against the source it claims to describe.
 *
 * The gate stops an unapproved claim from publishing. These tests are the other half: they check
 * that what *is* published is true of this branch, and that the specific claims earlier tasks
 * removed have not crept back in through a service page.
 */

const repoFile = (relative: string) =>
  readFileSync(resolve(__dirname, '../../../..', relative), 'utf8')

const publishedTextFor = (slug: string): string => {
  const service = allServices.find((candidate) => candidate.slug === slug)!
  return servicePublicText(service).join('\n')
}

const allPublishedText = (): string =>
  publishedServices().map((service) => servicePublicText(service).join('\n')).join('\n')

describe('claims removed by earlier tasks stay removed', () => {
  it.each([
    'premium cotton',
    'vivid print',
    'fast ship',
    'fast turnaround',
    'nz wide',
    'nationwide',
    'free shipping',
    'free delivery',
    'money-back',
  ])('no service page reintroduces "%s"', (claim) => {
    expect(allPublishedText().toLowerCase()).not.toContain(claim)
  })

  it('no service page states a dollar amount, in any form', () => {
    expect(allPublishedText()).not.toMatch(/\$\s*\d/)
  })

  it('no service page states a turnaround period', () => {
    expect(allPublishedText()).not.toMatch(
      /\b\d+\s*(?:business|working)?\s*(?:hours?|days?|weeks?)\b|\b(?:same|next)[- ]day\b/i,
    )
  })

  it('no service page states a minimum quantity', () => {
    expect(allPublishedText()).not.toMatch(/\bminimum\s+(?:order\s+)?(?:quantity\s+)?(?:of\s+)?\d/i)
  })

  it('no service page states a fabric, weight, fit, print method or care instruction', () => {
    expect(allPublishedText()).not.toMatch(/\bgsm\b|\b\d+%\s*(?:cotton|polyester)|\bdtg\b|\bwash\b|\btumble\b/i)
  })
})

describe('garment printing content matches the implemented configurator', () => {
  const text = () => publishedTextFor('custom-garment-printing')

  it('states that pricing comes from the backend, which the configurator does', () => {
    const source = repoFile('frontend/src/app/products/[id]/ProductConfiguratorClient.tsx')
    expect(source).toMatch(/pricingApi|calculateBatch/)
    expect(text()).toMatch(/calculated by our pricing service|comes back from our pricing service/i)
  })

  it('states the product-page price is a preview recalculated at checkout', () => {
    expect(text()).toMatch(/preview/i)
    expect(text()).toMatch(/recalculated at checkout/i)
  })

  it('warns that product design uploads are public, matching the storage split', () => {
    expect(repoFile('backend/src/TeeNova.Domain/Files/LocalFileStorageService.cs')).toContain('wwwroot')
    expect(text()).toMatch(/public uploads folder/i)
    expect(text()).toMatch(/do not send confidential material/i)
  })

  it('claims no fabric, fit, print method, care, stock or turnaround for any garment', () => {
    expect(text().toLowerCase()).not.toMatch(/cotton|polyester|fabric weight|slim fit|screen print|care/)
  })
})

describe('banner content matches the implemented enquiry contract', () => {
  it('lists exactly the material options the enquiry accepts', () => {
    const source = repoFile('backend/src/TeeNova.Domain.Shared/Orders/BannerMaterial.cs')
    for (const value of ['PullUp', 'Pvc', 'Mesh', 'Fabric', 'Other']) {
      expect(source).toContain(value)
    }
    const service = allServices.find((candidate) => candidate.slug === 'pvc-banners')!
    expect(service.facts.materials?.value).toEqual([
      'PVC banner',
      'Mesh banner',
      'Fabric banner',
      'Pull-up banner',
      'Another material you name',
    ])
  })

  it('presents materials and finishing as requestable options, never as a specification', () => {
    const service = allServices.find((candidate) => candidate.slug === 'pvc-banners')!
    expect(service.facts.materials?.presentation).toBe('requestable-options')
    expect(service.facts.finishes?.presentation).toBe('requestable-options')
    expect(service.facts.materials?.factBasis).toBe('implemented-code')
  })

  it('lists exactly the finishing options the enquiry records', () => {
    const source = repoFile('backend/src/TeeNova.Domain/Enquiries/BannerQuoteRequest.cs')
    for (const field of ['FinishingEyelets', 'FinishingHemming', 'FinishingPolePocket', 'FinishingOther']) {
      expect(source).toContain(field)
    }
  })

  it('keeps the two banner order paths distinct', () => {
    const text = publishedTextFor('pvc-banners')
    expect(text).toMatch(/set sizes/i)
    expect(text).toMatch(/quoted first|does not price it/i)
  })

  it('uses only the pull-up size labels the enquiry form offers, and attaches no price to them', () => {
    const source = repoFile('frontend/src/components/products/BannerProductDetail.tsx')
    expect(source).toContain('Pull-up 850×2000 mm')
    expect(source).toContain('Pull-up 1000×2000 mm')
    expect(source).toMatch(/no preset price table exists/)
    const service = allServices.find((candidate) => candidate.slug === 'pull-up-banners')!
    expect(service.facts.sizes?.value).toEqual(['Pull-up 850 × 2000 mm', 'Pull-up 1000 × 2000 mm'])
    expect(service.facts.price).toBeUndefined()
  })

  it('does not claim a maximum size, an outdoor rating or an expected life', () => {
    const text = `${publishedTextFor('pvc-banners')}\n${publishedTextFor('pull-up-banners')}`
    expect(text.toLowerCase()).not.toMatch(/outdoor rated|weather|uv resistan|maximum (?:width|size)|years/)
  })
})

describe('quote-only services invent nothing', () => {
  it.each(['business-cards', 'stickers-and-labels', 'signage'])(
    '%s publishes no specification facts at all',
    (slug) => {
      const service = allServices.find((candidate) => candidate.slug === slug)!
      expect(Object.keys(service.facts)).toEqual([])
    },
  )

  it('the signage page names no material, rating, installation or compliance position', () => {
    expect(publishedTextFor('signage').toLowerCase()).not.toMatch(
      /corflute \d|acm|acrylic|weatherproof|installation|council|consent/,
    )
  })

  it('the stickers page names no vinyl, adhesive, lamination or die-cut capability', () => {
    expect(publishedTextFor('stickers-and-labels').toLowerCase()).not.toMatch(
      /vinyl|adhesive|laminat|die[- ]cut|waterproof|roll of/,
    )
  })

  it('the business cards page names no paper stock, finish or quantity band', () => {
    expect(publishedTextFor('business-cards').toLowerCase()).not.toMatch(
      /gsm|matt lamina|gloss lamina|\b\d{2,}\s*cards\b/,
    )
  })

  it('rests the "we offer this" statement on existing public content, and nothing else on it', () => {
    for (const slug of ['business-cards', 'stickers-and-labels', 'signage']) {
      const service = allServices.find((candidate) => candidate.slug === slug)!
      const inherited = service.sections.filter((s) => s.factBasis === 'existing-public-content')
      expect(inherited.length).toBe(1)
      expect(inherited[0].kind).toBe('service-overview')
    }
  })
})

describe('bring your own garment', () => {
  it('does not claim every garment can be printed, or state a risk or preparation policy', () => {
    expect(publishedTextFor('bring-your-own-garment').toLowerCase()).not.toMatch(
      /any garment|all garments|at your own risk|we are not liable|must be washed/,
    )
  })

  it('states that the request is an enquiry with no order and no payment', () => {
    const text = publishedTextFor('bring-your-own-garment')
    expect(text).toMatch(/does not create an order/i)
    expect(text).toMatch(/never takes a payment|no payment is taken/i)
  })
})

describe('product-title rename proposals', () => {
  it('records the rename inventory without applying it', () => {
    expect(productTitleProposals.map((row) => row.currentName)).toEqual(['Badge', 'Bring your own'])
    for (const row of productTitleProposals) {
      expect(row.approvalState).toBe('not approved — proposal only')
      expect(row.suggestedName).not.toBe(row.currentName)
      expect(row.impact).toMatch(/no URL changes|Display-only/i)
    }
  })

  it('leaves the seed-controlled product names untouched', () => {
    const seed = repoFile('backend/src/TeeNova.Application/DataSeeding/TeeNovaDataSeedContributor.cs')
    for (const name of seedControlledProductNames) {
      expect(seed).toContain(name)
    }
    for (const row of productTitleProposals) {
      expect(seed).not.toContain(`"${row.suggestedName}"`)
    }
  })

  it('is never imported by a page, component, route or registry', () => {
    // A proposal that reached the render tree would be a rename applied by the back door.
    const importers = ['frontend/src/lib/service-content/registry.ts', 'frontend/src/app/services/page.tsx']
    for (const file of importers) {
      expect(repoFile(file)).not.toContain('product-title-proposals')
    }
  })
})
