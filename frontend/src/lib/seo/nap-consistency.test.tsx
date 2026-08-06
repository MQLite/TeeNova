import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Footer } from '@/components/layout/Footer'
import ContactPage from '@/app/contact/page'
import HomePage from '@/app/page'
import {
  approvedBusinessFacts,
  localBusinessBlockers,
  openingHours,
  openingHoursSentence,
  shopAddress,
} from '@/lib/site-business'
import { buildLocalBusiness, siteGraph } from './structured-data/organization'

/**
 * Jira 10308 Phase 17 — Name, Address, Phone consistency.
 *
 * The failure this guards against is the classic local-SEO one: a street address in JSON-LD that
 * does not match the footer, or opening hours that only a search engine can see. It is checked two
 * ways — by construction (every surface reads `lib/site-business.ts`) and by rendering each surface
 * and comparing what actually came out.
 *
 * The expected result today is "incomplete": the identity, hours and telephone approvals are open,
 * so there is no LocalBusiness node to be inconsistent with. That is recorded as a release blocker
 * rather than resolved by inventing values.
 */

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const textOf = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ')

describe('one visible address and one visible set of hours', () => {
  it('renders the same address string in the footer, the homepage and the contact page', () => {
    const surfaces = {
      footer: textOf(render(<Footer />).container),
      homepage: textOf(render(<HomePage />).container),
      contact: textOf(render(<ContactPage />).container),
    }
    for (const [name, text] of Object.entries(surfaces)) {
      expect(text, name).toContain(shopAddress.singleLine)
    }
  })

  it('renders the same opening hours everywhere they appear', () => {
    const footer = textOf(render(<Footer />).container)
    const contact = textOf(render(<ContactPage />).container)
    const home = textOf(render(<HomePage />).container)

    for (const row of openingHours) {
      expect(footer, row.label).toContain(`${row.label} ${row.display}`)
      expect(contact, row.label).toContain(row.display)
    }
    expect(home).toContain(openingHoursSentence)
  })

  it('writes the address and hours out in no source file other than the NAP module', () => {
    const root = join(process.cwd(), 'src')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.tsx?$/.test(entry.name)) continue
        const path = full.replace(/\\/g, '/')
        if (path.endsWith('src/lib/site-business.ts')) continue
        if (/\.test\.tsx?$/.test(path)) continue
        const text = readFileSync(full, 'utf8')
        if (text.includes('483 Great South Road')) offenders.push(`${path}: address`)
        if (/Mon.Fri 9am.5pm|Sat 10am.4pm/.test(text)) offenders.push(`${path}: hours`)
      }
    }
    walk(root)
    expect(offenders).toEqual([])
  })
})

describe('nothing appears only in structured data', () => {
  it('publishes no business node at all while the identity approval is open', () => {
    expect(buildLocalBusiness()).toBeNull()
    expect(siteGraph().map((node) => node['@type'])).toEqual(['WebSite'])
  })

  it('never puts an address or hours in the graph that the page does not show', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_IDENTITY_APPROVED', 'true')
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_ADDRESS_APPROVED', 'true')
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_HOURS_APPROVED', 'true')
    vi.resetModules()

    const { buildLocalBusiness: build } = await import('./structured-data/organization')
    const node = build()!
    const visible = textOf(render(<Footer />).container) + textOf(render(<ContactPage />).container)

    expect(visible).toContain(node.address!.streetAddress)
    expect(visible).toContain(node.address!.addressLocality)
    expect(visible).toContain(node.address!.postalCode)
    // Every specification the graph carries corresponds to a row the footer prints.
    expect(node.openingHoursSpecification).toHaveLength(openingHours.length)
  })

  it('publishes a telephone only once it is also rendered as a click-to-call link', async () => {
    // No number is configured, so neither the graph nor the page shows one.
    expect(approvedBusinessFacts().telephone).toBeNull()
    const withoutPhone = render(<ContactPage />).container
    expect(withoutPhone.querySelector('a[href^="tel:"]')).toBeNull()

    vi.stubEnv('NEXT_PUBLIC_BUSINESS_PHONE', '+64 9 555 0100')
    vi.resetModules()
    const { default: ContactWithPhone } = await import('@/app/contact/page')
    const { container } = render(<ContactWithPhone />)
    const link = container.querySelector('a[href^="tel:"]')
    expect(link).not.toBeNull()
    expect(textOf(container)).toContain('+64 9 555 0100')
  })
})

describe('release blockers', () => {
  it('reports the unresolved facts instead of filling them in', () => {
    const blockers = localBusinessBlockers()
    const facts = blockers.map((blocker) => blocker.fact)
    expect(facts).toContain('Public business name')
    expect(facts).toContain('Street address')
    expect(facts).toContain('Opening hours')
    expect(facts).toContain('Telephone')
    expect(facts).toContain('Public contact mailbox role')
    for (const blocker of blockers) {
      expect(blocker.approval).toMatch(/^A\d{2}/)
      expect(blocker.detail.length).toBeGreaterThan(20)
    }
  })

  it('renders no invented service area, price range or rating on any public surface', () => {
    const rendered = [
      textOf(render(<Footer />).container),
      textOf(render(<HomePage />).container),
      textOf(render(<ContactPage />).container),
    ].join(' ')
    expect(rendered).not.toMatch(/NZ[- ]?wide|nationwide|delivery to all|\b\d(\.\d)?\s*(star|\/5)\b/i)
    expect(approvedBusinessFacts().areaServed).toEqual([])
    expect(approvedBusinessFacts().priceRange).toBeNull()
  })
})
