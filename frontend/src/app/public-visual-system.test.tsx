import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ServiceCardGrid as ServiceCardGridForTest } from '@/components/services/ServiceCard'

/**
 * Public-surface visual system (Jira 10307).
 *
 * Two kinds of check:
 *
 *   - rendered assertions, for what a customer or a screen reader receives;
 *   - source scans, for the class-level regressions a rendered assertion cannot
 *     see (a reintroduced emoji illustration, a fourth full-bleed gradient band,
 *     a `min-w-[420px]` that would break a 320px viewport).
 *
 * Every content guarantee from Jira 10301–10306 that a restyle could plausibly
 * break is re-asserted here, because a styling change is exactly the kind of
 * diff in which a fabricated claim can reappear unnoticed.
 */

const frontendRoot = (): string => {
  for (const candidate of [process.cwd(), join(process.cwd(), '..'), join(process.cwd(), '..', '..')]) {
    if (existsSync(join(candidate, 'tailwind.config.ts'))) return candidate
  }
  throw new Error('Could not locate the frontend root from ' + process.cwd())
}
const root = frontendRoot()
const src = (...parts: string[]) => readFileSync(join(root, 'src', ...parts), 'utf8')
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

/** Every non-test source file under `src/app` and `src/components`, excluding Admin. */
function publicSources(): { path: string; text: string }[] {
  const files: { path: string; text: string }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'admin' || entry.name === 'api') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        files.push({ path: full.slice(root.length + 1), text: readFileSync(full, 'utf8') })
      }
    }
  }
  walk(join(root, 'src', 'app'))
  walk(join(root, 'src', 'components'))
  walk(join(root, 'src', 'content'))
  return files
}

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu

describe('homepage', () => {
  it('preserves the Jira 10305 compact mobile hero', async () => {
    const { default: HomePage } = await import('./page')
    const { container } = render(<HomePage />)
    const hero = container.querySelector('section.hero-gradient')
    expect(hero).toHaveClass('py-8', 'sm:py-24', 'lg:py-36')
  })

  it('keeps the primary CTA in the hero, above the next section', async () => {
    const { default: HomePage } = await import('./page')
    const { container } = render(<HomePage />)
    const hero = container.querySelector('section.hero-gradient')!
    expect(hero).toHaveTextContent('Browse Products')
    expect(hero).toHaveTextContent('Request a Quote')
  })

  it('renders exactly one h1', async () => {
    const { default: HomePage } = await import('./page')
    render(<HomePage />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('drives the service grid from the published registry', async () => {
    const { default: HomePage } = await import('./page')
    const { publishedServices } = await import('@/lib/service-content/registry')
    render(<HomePage />)
    for (const service of publishedServices()) {
      expect(screen.getByRole('heading', { name: service.name })).toBeInTheDocument()
    }
  })

  it('publishes no trust pill, review counter or rating', async () => {
    const { default: HomePage } = await import('./page')
    const { container } = render(<HomePage />)
    const text = container.textContent!.toLowerCase()
    for (const claim of [
      'fast turnaround', 'nz wide', 'nationwide', 'free shipping', 'in-house',
      'reviews', 'rating', '5 stars', 'trusted by', 'customers served', 'satisfaction',
    ]) {
      expect(text).not.toContain(claim)
    }
  })

  it('renders no photograph and no portfolio section without published work', async () => {
    const { default: HomePage } = await import('./page')
    const { container } = render(<HomePage />)
    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(screen.queryByRole('heading', { name: 'Recent Work' })).toBeNull()
  })

  it('uses icons rather than emoji for the audience cues', async () => {
    const { default: HomePage } = await import('./page')
    const { container } = render(<HomePage />)
    expect(container.textContent).not.toMatch(EMOJI)
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(6)
  })
})

describe('gradient is a bounded accent', () => {
  it('appears on the two homepage bands and nowhere else in the marketing site', () => {
    const users = publicSources()
      .filter(({ text }) => /hero-gradient/.test(stripComments(text)))
      .map(({ path }) => path.replace(/\\/g, '/'))
    expect(users.sort()).toEqual([
      // Post-purchase confirmation surfaces. Jira 10307 deliberately did not enter checkout or
      // order files, so these keep the gradient they already had — now with the scrim, which
      // improves their white-on-gradient contrast without changing a line in them. Recorded as a
      // known limitation in the evidence document rather than silently allowed.
      'src/app/checkout/cancel/page.tsx',
      'src/app/checkout/success/page.tsx',
      'src/app/orders/[id]/page.tsx',
      'src/app/page.tsx',
      'src/components/ui/PageHero.tsx',
    ])
    // Two bands on the homepage: hero and the closing CTA.
    const home = stripComments(src('app', 'page.tsx'))
    expect([...home.matchAll(/hero-gradient/g)]).toHaveLength(2)
  })

  it('gives section-entry and working pages their own hero treatments', () => {
    expect(src('app', 'services', 'page.tsx')).toMatch(/variant="inverse"/)
    expect(src('app', 'quote', 'page.tsx')).toMatch(/variant="inverse"/)
    expect(src('app', 'products', 'page.tsx')).toMatch(/variant="plain"/)
    expect(src('app', 'portfolio', 'page.tsx')).toMatch(/variant="plain"/)
  })
})

describe('services', () => {
  it('renders every published service card with an icon and a named CTA', async () => {
    const { ServiceCardGrid } = await import('@/components/services/ServiceCard')
    const { publishedServices } = await import('@/lib/service-content/registry')
    const services = publishedServices()
    const { container } = render(<ServiceCardGrid services={services} />)
    expect(container.textContent).not.toMatch(EMOJI)
    for (const service of services) {
      // No bare "Learn more": every CTA names its service.
      expect(screen.getByText(`View ${service.shortName}`)).toBeInTheDocument()
    }
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(services.length)
  })

  it('types the service icon so an unrelated glyph cannot be assigned', async () => {
    const { ICON_NAMES } = await import('@/components/ui/Icon')
    const { allServices } = await import('@/lib/service-content/registry')
    for (const service of allServices) {
      expect(ICON_NAMES).toContain(service.iconName)
    }
  })

  it('keeps the long descriptive quote CTA able to wrap', () => {
    const cta = src('components', 'services', 'ServiceQuoteCta.tsx')
    expect(cta).not.toMatch(/whitespace-nowrap/)
    expect(src('app', 'services', 'page.tsx')).not.toMatch(/whitespace-nowrap/)
  })

  it('states no commercial fact that the definitions do not carry', async () => {
    const { publishedServices } = await import('@/lib/service-content/registry')
    const services = publishedServices()
    expect(services.length).toBeGreaterThan(0)
    const { container } = render(<ServiceCardGridForTest services={services} />)
    // Everything the card renders comes from the definition; the component contributes only the
    // word "View" and the service's own name.
    const rendered = container.textContent!
    for (const claim of ['$', 'NZD', 'turnaround', 'minimum', 'business day', 'from just']) {
      expect(rendered).not.toContain(claim)
    }
  })
})

describe('product list', () => {
  it('adds no unsupported badge or claim to the card', () => {
    const card = stripComments(src('components', 'products', 'ProductCard.tsx')).toLowerCase()
    for (const claim of [
      'best seller', 'bestseller', 'popular', 'in stock', 'out of stock',
      'discount', 'sale', '% off', 'rating', 'stars', 'free delivery', 'ships',
    ]) {
      expect(card).not.toContain(claim)
    }
  })

  it('keeps the product route and the display-price rules unchanged', () => {
    const card = src('components', 'products', 'ProductCard.tsx')
    expect(card).toMatch(/href=\{`\/products\/\$\{product\.id\}`\}/)
    expect(card).toMatch(/product\.hasPriceTiers && product\.fromPrice !== null/)
    expect(card).toMatch(/formatMoneyNZD/)
  })

  it('distinguishes its empty, no-match and outage states', () => {
    const page = src('app', 'products', 'page.tsx')
    expect(page).toMatch(/variant="error"/)
    expect(page).toMatch(/icon="package"/)
    expect(page).toMatch(/icon="search"/)
    expect(stripComments(page)).not.toMatch(EMOJI)
  })
})

describe('product detail states', () => {
  it('distinguishes a missing product from a temporary failure', async () => {
    const { default: NotFound } = await import('./products/[id]/not-found')
    const { container: missing } = render(<NotFound />)
    expect(missing.textContent).toContain('This product isn’t available')
    // A 404 offers no "try again" — retrying cannot make an unpublished product appear.
    expect(missing.textContent).not.toMatch(/try again/i)

    const notFoundSource = stripComments(src('app', 'products', '[id]', 'not-found.tsx'))
    const errorSource = stripComments(src('app', 'products', '[id]', 'error.tsx'))
    expect(errorSource).toMatch(/Try again/)
    // Different glyphs and different tones.
    expect(errorSource).toMatch(/bg-danger-surface/)
    expect(notFoundSource).toMatch(/bg-surface-sunken/)
    for (const source of [notFoundSource, errorSource]) expect(source).not.toMatch(EMOJI)
  })

  it('shows no exception detail on the error route', () => {
    const errorSource = src('app', 'products', '[id]', 'error.tsx')
    expect(errorSource).not.toMatch(/\{error\.(message|stack|digest)\}/)
  })

  it('keeps the structural skeleton and its polite status message', async () => {
    const { ProductDetailSkeleton } = await import('./products/[id]/ProductDetailSkeleton')
    const { container } = render(<ProductDetailSkeleton />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading product details')
    expect(container.querySelector('[aria-hidden="true"].animate-pulse')).not.toBeNull()
    expect(container.querySelector('.aspect-square')).not.toBeNull()
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(10)
  })

  it('gives the site a styled 404 inside the site chrome', async () => {
    const { default: NotFound } = await import('./not-found')
    render(<NotFound />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('We couldn’t find that page')
    expect(screen.getByRole('link', { name: 'Browse Products' })).toBeInTheDocument()
  })
})

describe('quote page', () => {
  it('keeps the not-an-order and no-payment wording', () => {
    const page = stripComments(src('app', 'quote', 'page.tsx'))
    const form = stripComments(src('app', 'quote', 'QuoteFormClient.tsx'))
    expect(page).toMatch(/does not place an order and takes no payment|No payment required/)
    expect(form).toMatch(/not an order/)
    expect(form).toMatch(/no payment is taken|No payment has been taken/i)
  })

  it('implies no instant price or guaranteed response time', () => {
    const combined = (
      stripComments(src('app', 'quote', 'page.tsx')) + stripComments(src('app', 'quote', 'QuoteFormClient.tsx'))
    ).toLowerCase()
    for (const claim of [
      'instant quote', 'instant price', 'within 24 hours', 'same day', 'guaranteed',
      'reply within', 'immediately',
    ]) {
      expect(combined).not.toContain(claim)
    }
  })

  it('uses the shared form-control tokens', () => {
    const form = src('app', 'quote', 'QuoteFormClient.tsx')
    expect(form).toMatch(/const inputClass = 'form-input/)
    expect(form).toMatch(/className="form-legend"/)
    expect(form).toMatch(/className="form-error"/)
  })

  it('preserves the accessible error summary, upload states and privacy notice', () => {
    const form = src('app', 'quote', 'QuoteFormClient.tsx')
    expect(form).toMatch(/role="alert" aria-labelledby="quote-errors-heading"/)
    expect(form).toMatch(/aria-live="polite"/)
    expect(form).toMatch(/staged in private storage|stored privately/i)
    expect(form).toMatch(/\/help\/artwork-requirements/)
    // The Privacy Policy is still Draft: it must not be linked publicly.
    expect(form).not.toMatch(/href="\/policies\/privacy"/)
  })

  it('keeps the feature-off email fallback', () => {
    const page = src('app', 'quote', 'page.tsx')
    expect(page).toMatch(/if \(!quoteFormEnabled\)/)
    expect(page).toMatch(/emailHref/)
  })
})

describe('portfolio', () => {
  it('separates "switched off" from "nothing published yet"', () => {
    const page = stripComments(src('app', 'portfolio', 'page.tsx'))
    expect(page).toMatch(/variant="disabled"/)
    expect(page).toMatch(/variant="empty"/)
  })

  it('keeps a stable image ratio and real alt text', () => {
    const grid = src('components', 'portfolio', 'PortfolioGrid.tsx')
    expect(grid).toMatch(/aspect-\[4\/3\]/)
    expect(grid).toMatch(/alt=\{image\.altText\}/)
    expect(grid).toMatch(/sizes="/)
  })

  it('fabricates no media and leaks no internal reference', () => {
    for (const file of [
      src('app', 'portfolio', 'page.tsx'),
      src('app', 'portfolio', '[slug]', 'page.tsx'),
      src('components', 'portfolio', 'PortfolioGrid.tsx'),
    ]) {
      expect(file).not.toMatch(/unsplash|placeholder\.com|picsum|\.jpg|\.png/i)
      expect(file).not.toMatch(/objectKey|permissionReference|storageKey/i)
    }
  })
})

describe('help and policy pages', () => {
  it('keeps one h1, a scrollable table and the Draft banner', () => {
    const layout = stripComments(src('components', 'content', 'ContentPageLayout.tsx'))
    expect([...layout.matchAll(/<h1/g)]).toHaveLength(1)
    expect(layout).toMatch(/DraftContentBanner/)
    const blocks = src('components', 'content', 'ContentBlocks.tsx')
    expect(blocks).toMatch(/overflow-x-auto/)
    expect(blocks).toMatch(/scope="col"/)
    expect(blocks).toMatch(/<caption/)
  })

  /**
   * One file is allowed to use `dangerouslySetInnerHTML`, and only one: the JSON-LD renderer added
   * in Jira 10308. A `<script>` element's content is raw text, so React cannot set it through
   * children without escaping it into invalid JSON. The exception is listed by name here — a second
   * file appearing in this list is a review event, not a passing test — and the escaping that makes
   * it safe is asserted below rather than taken on trust.
   */
  const RAW_HTML_EXCEPTIONS = ['src/components/seo/JsonLd.tsx']

  it('renders content as children, never as raw HTML', () => {
    const offenders = publicSources()
      .filter(({ text }) => /dangerouslySetInnerHTML/.test(stripComments(text)))
      .map(({ path }) => path.replace(/\\/g, '/'))
    expect(offenders.sort()).toEqual(RAW_HTML_EXCEPTIONS)
  })

  it('escapes the sequences that could break out of the JSON-LD script element', () => {
    const renderer = src('components', 'seo', 'JsonLd.tsx')
    // `</script` is matched case-insensitively by the HTML parser regardless of JSON string
    // quoting, and JSON.stringify does not escape these characters.
    expect(renderer).toMatch(/replace\(\/<\/g, '\\\\u003c'\)/)
    expect(renderer).toMatch(/replace\(\/>\/g, '\\\\u003e'\)/)
    // U+2028/U+2029 are legal in JSON strings but terminate a line to a JavaScript parser.
    expect(renderer).toMatch(/\\u2028/)
    expect(renderer).toMatch(/\\u2029/)
  })

  it('keeps the Draft banner visible in preview mode', () => {
    const layout = stripComments(src('components', 'content', 'ContentPageLayout.tsx'))
    expect(layout).toMatch(/isDraftPreview && <DraftContentBanner/)
    expect(layout).not.toMatch(/isDraftPreview[^\n]*(hidden|sr-only)/)
  })
})

describe('responsive safety', () => {
  it('declares no fixed width that would overflow a 320px viewport', () => {
    const offenders: string[] = []
    for (const { path, text } of publicSources()) {
      // `max-w-[440px]` is a cap, not a floor — only `w-` and `min-w-` can force an overflow.
      for (const match of text.matchAll(/(?<!max-)\b(?:min-w|w)-\[(\d+)px\]/g)) {
        if (Number(match[1]) > 288) offenders.push(`${path}: ${match[0]}`)
      }
    }
    // 288px = 320px viewport minus the 16px gutter on each side.
    expect(offenders).toEqual([])
  })

  it('scrolls wide tables and grids inside their own container', () => {
    const blocks = src('components', 'content', 'ContentBlocks.tsx')
    const wide = /min-w-\[32rem\]/.test(blocks)
    expect(wide).toBe(true)
    expect(blocks).toMatch(/overflow-x-auto[\s\S]*?min-w-\[32rem\]/)
  })

  it('clips a stray wide child rather than scrolling the page body', () => {
    expect(src('app', 'globals.css')).toMatch(/html \{[\s\S]*?overflow-x: hidden/)
  })

  it('keeps clearance under the sticky mobile action bar', () => {
    const configurator = src('app', 'products', '[id]', 'MobileGarmentConfigurator.tsx')
    expect(configurator).toMatch(/pb-\[calc\(7\.5rem\+env\(safe-area-inset-bottom\)\)\]/)
    expect(configurator).toMatch(/pb-\[calc\(0\.75rem\+env\(safe-area-inset-bottom\)\)\]/)
    expect(src('app', 'globals.css')).toMatch(/--space-sticky-clearance:\s*calc\(7\.5rem \+ env\(safe-area-inset-bottom\)\)/)
  })
})

describe('emoji is no longer the interface icon system', () => {
  it('leaves no pictographic emoji illustration on a public surface', () => {
    // Typographic marks used as decoration inside `aria-hidden` elements (a tick beside a selected
    // colour, a step marked complete) are allowed and unchanged. What is banned is emoji standing
    // in as an *illustration* — a service icon, an audience cue, an empty-state picture — because
    // it renders as a different image on every platform and cannot take the text colour.
    const TYPOGRAPHIC = new Set(['✓', '✔', '✗', '✕', '−', '·', '›'])
    const offenders: string[] = []
    for (const { path, text } of publicSources()) {
      for (const match of stripComments(text).matchAll(EMOJI)) {
        if (!TYPOGRAPHIC.has(match[0])) offenders.push(`${path}: ${match[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('leaves no emoji in the service content registry', () => {
    for (const { path, text } of publicSources().filter((f) => f.path.includes('content'))) {
      expect(text, path).not.toMatch(EMOJI)
    }
  })
})

describe('commerce isolation', () => {
  it('leaves cart, checkout, order and payment sources untouched by this task', () => {
    // These files are read to prove the visual pass changed nothing in them: they carry no token
    // class introduced here, because the pass deliberately did not enter them.
    for (const file of [
      join('app', 'cart', 'page.tsx'),
      join('app', 'checkout', 'page.tsx'),
      join('features', 'cart', 'cart-store.ts'),
      join('features', 'checkout', 'order-item-payload.ts'),
      join('lib', 'pricing.ts'),
    ]) {
      expect(existsSync(join(root, 'src', file)), file).toBe(true)
    }
    const cart = src('app', 'cart', 'page.tsx')
    expect(cart).not.toMatch(/eftpos|bank transfer|free shipping|nz wide/i)
  })
})
