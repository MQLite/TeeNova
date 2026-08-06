import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { allPublicContentDocuments, findDocument, isPublished } from '@/lib/public-content/registry'
import { publicText } from '@/lib/public-content/validation'
import type { PublicContentDocument } from '@/lib/public-content/types'

/**
 * Jira 10303 — what the published pages actually say must match what the code actually does.
 *
 * Several assertions read the backend source directly, so that a future change to an upload limit
 * or an accepted extension fails this suite instead of silently making a public page wrong.
 */

const repoRoot = join(process.cwd(), '..')
const readBackend = (relativePath: string) =>
  readFileSync(join(repoRoot, 'backend', relativePath), 'utf8')

const published = (slug: string, group: 'help' | 'policies' = 'help') => {
  const document = findDocument(group, slug)!
  return publicText(document).join('\n')
}

const everyText = (document: PublicContentDocument) =>
  document.sections
    .flatMap((section) => [
      section.heading,
      ...section.blocks.flatMap((block) => {
        switch (block.kind) {
          case 'paragraph':
            return [block.text]
          case 'list':
            return block.items
          case 'definitions':
            return block.items.flatMap((item) => [item.term, item.description])
          case 'table':
            return [block.caption, ...block.columns, ...block.rows.flat()]
          case 'notice':
            return [block.title ?? '', block.text]
        }
      }),
    ])
    .join('\n')

describe('artwork guidance matches implemented file handling', () => {
  const artwork = published('artwork-requirements')

  it('is published', () => {
    expect(isPublished(findDocument('help', 'artwork-requirements')!)).toBe(true)
  })

  it('lists exactly the extensions the quote attachment options allow', () => {
    const options = readBackend('src/TeeNova.Domain/Enquiries/QuoteRequestOptions.cs')
    const allowed = options.match(/AllowedExtensions[\s\S]*?=\s*\[([^\]]*)\]/)![1]
    expect(allowed).toContain('.png')
    expect(allowed).toContain('.jpg')
    expect(allowed).toContain('.jpeg')
    expect(allowed).toContain('.webp')
    expect(allowed).toContain('.pdf')
    expect(allowed).toContain('.ai')
    expect(allowed).not.toContain('.svg')

    expect(artwork).toMatch(/PNG, JPEG \(\.jpg or \.jpeg\), WebP, PDF and Adobe Illustrator/)
  })

  it('matches the design upload allow-list in the file service', () => {
    const service = readBackend('src/TeeNova.Application/Files/FileAppService.cs')
    for (const extension of ['".png"', '".jpg"', '".jpeg"', '".webp"', '".pdf"', '".ai"']) {
      expect(service).toContain(extension)
    }
    expect(service).not.toMatch(/\[".svg"\]/)
  })

  it('states the size and count limits the backend enforces', () => {
    const options = readBackend('src/TeeNova.Domain/Enquiries/QuoteRequestOptions.cs')
    expect(options).toContain('MaxAttachments { get; set; } = 5')
    expect(options).toContain('MaxAttachmentBytes { get; set; } = 20 * 1024 * 1024')
    expect(options).toContain('MaxTotalAttachmentBytes { get; set; } = 60 * 1024 * 1024')

    const service = readBackend('src/TeeNova.Application/Files/FileAppService.cs')
    expect(service).toContain('MaxFileSizeBytes = 20 * 1024 * 1024')

    expect(artwork).toContain('20 MB')
    expect(artwork).toContain('60 MB in total')
    expect(artwork).toContain('5 files')
  })

  it('states that SVG is rejected', () => {
    expect(artwork).toMatch(/SVG files are not accepted/)
  })

  it('describes quote artwork as private storage outside the public site folder', () => {
    expect(artwork).toMatch(/private storage that sits outside the public website folder/)
    expect(artwork).toMatch(/No public web address is created for it/)
  })

  it('distinguishes the public product design upload from private quote storage', () => {
    expect(artwork).toMatch(/public uploads folder and is served as a static file/)
    expect(artwork).toMatch(/not private storage/i)
  })

  it('does not claim any antivirus or malware scanning', () => {
    expect(artwork).toMatch(/We do not run a virus or malware scanner/)
    expect(artwork).not.toMatch(/scanned for viruses|virus[- ]checked|malware[- ]scanned/i)
  })

  it('states that uploading artwork does not create an order', () => {
    expect(artwork).toMatch(/does not create an order/)
    expect(artwork).toMatch(/does not reserve stock/)
    expect(artwork).toMatch(/does not take payment/)
  })

  it('keeps print-production preferences unpublished', () => {
    const document = findDocument('help', 'artwork-requirements')!
    const draftIds = document.sections.filter((s) => s.status === 'draft').map((s) => s.id)
    expect(draftIds).toContain('resolution-and-colour')
    expect(draftIds).toContain('proofing-and-charges')
    expect(artwork).not.toMatch(/\b\d{2,3}\s?dpi\b/i)
    expect(artwork).not.toMatch(/\bbleed\b/i)
    expect(artwork).not.toMatch(/\bCMYK\b/)
  })
})

describe('FAQ answers', () => {
  const faq = findDocument('help', 'faq')!
  const publishedFaq = publicText(faq).join('\n')

  it('publishes only answers that restate implemented behaviour', () => {
    const publishedSections = faq.sections.filter((section) => section.status === 'published')
    expect(publishedSections.length).toBeGreaterThan(0)
    for (const section of publishedSections) {
      expect(section.factBasis).toBe('implemented-code')
      expect(section.evidenceReference?.trim()).toBeTruthy()
    }
  })

  it('excludes draft answers from the rendered page', () => {
    const draftHeadings = faq.sections
      .filter((section) => section.status === 'draft')
      .map((section) => section.heading)
    expect(draftHeadings).toContain('Can I collect my order?')
    expect(draftHeadings).toContain('Do you deliver?')
    for (const heading of draftHeadings) expect(publishedFaq).not.toContain(heading)
  })

  it('answers the quote question consistently with the Jira 10301 workflow', () => {
    expect(publishedFaq).toMatch(/A quote request is an enquiry/)
    expect(publishedFaq).toMatch(/does not create an order/)
    expect(publishedFaq).toMatch(/does not take any payment/)
    expect(publishedFaq).toMatch(/given a short reference/)
  })

  it('invents no turnaround period', () => {
    expect(publishedFaq).not.toMatch(/\b\d+\s*[–-]\s*\d+\s*(business\s+)?(day|days|week|weeks|hour|hours)\b/i)
    expect(publishedFaq).not.toMatch(/\bwithin \d+ (business )?(day|days|hour|hours|week|weeks)\b/i)
    expect(publishedFaq).toMatch(/We do not publish a response deadline/)
  })

  it('makes no guarantee or quality promise', () => {
    expect(publishedFaq).not.toMatch(/\bguarantee|guaranteed|money[- ]back|warranty\b/i)
  })
})

describe('turnaround content', () => {
  const turnaround = findDocument('help', 'turnaround')!

  it('stays unpublished while no duration is approved', () => {
    expect(isPublished(turnaround)).toBe(false)
  })

  it('contains no duration anywhere, published or not', () => {
    expect(everyText(turnaround)).not.toMatch(/\b\d+\s*(business\s+)?(day|days|week|weeks|hour|hours)\b/i)
  })

  it('does not reinstate the removed fast-turnaround claim', () => {
    expect(everyText(turnaround)).not.toMatch(/fast turnaround|quick turnaround|same[- ]day|next[- ]day/i)
  })
})

describe('delivery and pickup content', () => {
  const delivery = findDocument('help', 'delivery-and-pickup')!

  it('stays unpublished while no delivery rule is approved', () => {
    expect(isPublished(delivery)).toBe(false)
  })

  it('describes only the fulfilment choices the code actually offers', () => {
    const enumSource = readBackend('src/TeeNova.Domain.Shared/Enquiries/QuoteFulfilmentPreference.cs')
    expect(enumSource).toContain('Pickup')
    expect(enumSource).toContain('Delivery')
    expect(enumSource).toContain('NotSure')
    expect(everyText(delivery)).toMatch(/accepts "not sure"/)
  })

  it('invents no carrier, fee, threshold or nationwide claim', () => {
    const text = everyText(delivery)
    expect(text).not.toMatch(/NZ Post|CourierPost|Aramex|DHL|FedEx/i)
    expect(text).not.toMatch(/free (shipping|delivery)/i)
    expect(text).not.toMatch(/nationwide|NZ[- ]wide/i)
    expect(text).not.toMatch(/\$\s?\d/)
  })

  it('does not restate the unapproved shop address or opening hours as policy', () => {
    const text = everyText(delivery)
    expect(text).not.toMatch(/483 Great South Road/)
    expect(text).not.toMatch(/Mon–Fri|9am|10am|5pm|4pm/)
  })
})

describe('privacy content', () => {
  const privacy = findDocument('policies', 'privacy')!
  const text = everyText(privacy)

  it('cannot publish without a retention period and legal approval', () => {
    expect(isPublished(privacy)).toBe(false)
    expect(privacy.approvalRequirement).toBe('owner-and-legal')
    expect(privacy.sections.find((section) => section.id === 'retention')?.status).toBe('draft')
  })

  it('lists the quote fields the aggregate actually stores', () => {
    for (const field of [
      'name and email address',
      'phone number',
      'organisation name',
      'Quantity, width, height and unit',
      'delivery suburb',
      'artwork files',
    ]) {
      expect(text).toContain(field)
    }
  })

  it('does not claim the raw network address is stored', () => {
    expect(text).toMatch(/We do not store the IP address/)
    expect(text).toMatch(/one-way keyed hash/)
    // The hash is conditional on a configured key, and the wording must say so.
    expect(text).toMatch(/Where a hashing key is configured/)
  })

  it('describes browser storage accurately', () => {
    expect(text).toMatch(/session storage/)
    expect(text).toMatch(/Prices, artwork files, artwork addresses, notes and identity details are deliberately excluded/)
    expect(text).toMatch(/local storage so the cart survives a reload/)
    expect(text).toMatch(/sign-in cookie is set only for staff/)
  })

  it('does not claim card numbers are stored, and does not claim data is never shared', () => {
    expect(text).toMatch(/We do not store card numbers/)
    expect(text).not.toMatch(/never share|do not share your (data|information) with anyone/i)
    expect(text).toMatch(/email provider, which necessarily receives/)
  })

  it('makes no analytics or cookie-consent claim the repository cannot support', () => {
    expect(text).toMatch(/does not use an analytics or tracking service/)
    expect(text).not.toMatch(/Google Analytics|cookie consent banner is shown|we use cookies to track/i)
  })

  it('invents no retention period, legal basis or overseas-transfer claim', () => {
    expect(text).not.toMatch(/\b\d+\s*(day|days|month|months|year|years)\b/i)
    expect(text).not.toMatch(/legitimate interest|lawful basis is/i)
    expect(text).not.toMatch(/stored (overseas|offshore)|transferred outside New Zealand/i)
  })

  it('leaves the privacy contact mailbox to configuration', () => {
    expect(text).toMatch(/privacy contact address is supplied through site configuration/)
    expect(text).not.toMatch(/@gmail\.com/)
  })
})

describe('returns and terms content', () => {
  it('keeps returns unpublished and free of invented policy', () => {
    const returns = findDocument('policies', 'returns')!
    expect(isPublished(returns)).toBe(false)
    expect(returns.approvalRequirement).toBe('owner-and-legal')
    const text = everyText(returns)
    expect(text).not.toMatch(/no refunds|all sales are final|non[- ]refundable/i)
    expect(text).not.toMatch(/within \d+ (day|days|hours)/i)
    expect(text).toMatch(/Statutory consumer rights are not affected/)
  })

  it('keeps terms unpublished rather than shipping boilerplate', () => {
    const terms = findDocument('policies', 'terms')!
    expect(isPublished(terms)).toBe(false)
    expect(terms.approvalRequirement).toBe('legal')
    expect(terms.sections.every((section) => section.status === 'draft')).toBe(true)
  })
})

describe('payment terms content', () => {
  const payment = findDocument('policies', 'payment-terms')!
  const text = everyText(payment)

  it('stays unpublished without owner and legal approval', () => {
    expect(isPublished(payment)).toBe(false)
    expect(payment.approvalRequirement).toBe('owner-and-legal')
  })

  it('describes only the deposit rule the order aggregate already enforces', () => {
    const order = readBackend('src/TeeNova.Domain/Orders/Order.cs')
    expect(order).toContain('RequiredDepositAmount  = Math.Ceiling(TotalAmount * 0.50m * 100m) / 100m')
    expect(text).toMatch(/at least half of the order total as a deposit/)
    // No percentage other than the enforced half is asserted.
    expect(text).not.toMatch(/\b(10|20|25|30|40|60|70|75|80|90)\s?%/)
  })

  it('invents no invoice term or payment deadline', () => {
    expect(text).not.toMatch(/\b(7|14|20|30|60)\s*days?\b/i)
    expect(text).not.toMatch(/net \d+/i)
  })

  it('uses NZ$ when it names the currency', () => {
    expect(text).toMatch(/New Zealand dollars, shown as NZ\$/)
  })

  it('names no live payment method as offered', () => {
    expect(text).not.toMatch(/we accept (cash|eftpos|bank transfer)/i)
    expect(text).toMatch(/are owner decisions and are not stated until confirmed/)
  })
})

describe('size guide and garment care content', () => {
  it('publishes no measurement', () => {
    const sizeGuide = findDocument('help', 'size-guide')!
    expect(isPublished(sizeGuide)).toBe(false)
    const text = everyText(sizeGuide)
    expect(text).not.toMatch(/\b\d+\s?(cm|in|inches)\b/i)
    expect(text).not.toMatch(/chest \d|width \d/i)
    expect(text).toMatch(/no measurement, fabric weight, fit or brand field/)
  })

  it('publishes no universal care instruction', () => {
    const care = findDocument('help', 'garment-care')!
    expect(isPublished(care)).toBe(false)
    const text = everyText(care)
    expect(text).not.toMatch(/wash at \d+|\b\d+\s?°C\b|cold wash only|tumble dry low/i)
    expect(text).not.toMatch(/premium cotton|100% cotton/i)
  })
})

describe('all documents', () => {
  it('never renders raw HTML and never exposes an internal storage path publicly', () => {
    for (const document of allPublicContentDocuments) {
      const text = everyText(document)
      expect(text).not.toMatch(/<[a-z][^>]*>/i)
      expect(text).not.toMatch(/App_Data|wwwroot|C:\\|\/home\/|localhost:\d+/)
      expect(text).not.toMatch(/\/admin\//)
    }
  })

  it('does not expose evidence or approval references in public text', () => {
    for (const document of allPublicContentDocuments) {
      const publicOnly = publicText(document).join('\n')
      for (const section of document.sections) {
        if (section.evidenceReference) expect(publicOnly).not.toContain(section.evidenceReference)
      }
    }
  })

  it('uses no real customer name or contact detail as sample content', () => {
    for (const document of allPublicContentDocuments) {
      const text = everyText(document)
      expect(text).not.toMatch(/@[a-z0-9.-]+\.(com|co\.nz|nz)/i)
      expect(text).not.toMatch(/\+?64\s?\d|\b0\d{1,2}[\s-]?\d{3}[\s-]?\d{4}\b/)
    }
  })
})
