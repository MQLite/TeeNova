import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandGlyph, BrandMark } from '@/components/brand/BrandMark'
import { Button } from './Button'
import { Icon, ICON_NAMES } from './Icon'
import { ActionGroup, CardGrid, ContentMeasure, PageContainer, Section, SectionHeading } from './Layout'
import { EmptyState, Notice, StatusBadge } from './Notice'
import { PageHero } from './PageHero'

/**
 * Shared visual-system primitives (Jira 10307).
 *
 * These assert behaviour a stylesheet cannot: which element is rendered, what an
 * assistive technology is told, and whether a variant is distinguishable by
 * something other than colour.
 */

const frontendRoot = (): string => {
  for (const candidate of [process.cwd(), join(process.cwd(), '..'), join(process.cwd(), '..', '..')]) {
    if (existsSync(join(candidate, 'tailwind.config.ts'))) return candidate
  }
  throw new Error('Could not locate the frontend root from ' + process.cwd())
}
const root = frontendRoot()
const css = readFileSync(join(root, 'src', 'app', 'globals.css'), 'utf8')
const source = (...parts: string[]) => readFileSync(join(root, 'src', ...parts), 'utf8')

describe('button system', () => {
  it('offers primary, secondary, tertiary and destructive variants', () => {
    const { container } = render(
      <>
        <Button variant="black">Primary</Button>
        <Button variant="white">On dark</Button>
        <Button variant="glass">Secondary</Button>
        <Button variant="ghost">Tertiary</Button>
        <Button variant="danger">Destructive</Button>
      </>,
    )
    const classes = [...container.querySelectorAll('button')].map((b) => b.className)
    expect(classes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('btn-black'),
        expect.stringContaining('btn-white'),
        expect.stringContaining('btn-glass'),
        expect.stringContaining('btn-text'),
        expect.stringContaining('btn-danger'),
      ]),
    )
  })

  it('offers compact, standard and large sizes', () => {
    const { container } = render(
      <>
        <Button size="sm">Compact</Button>
        <Button size="md">Standard</Button>
        <Button size="lg">Large</Button>
      </>,
    )
    const classes = [...container.querySelectorAll('button')].map((b) => b.className)
    expect(classes[0]).toContain('btn-sm')
    expect(classes[1]).not.toContain('btn-sm')
    expect(classes[2]).toContain('btn-lg')
  })

  it('never forces every button label onto one line', () => {
    // `white-space: nowrap` on the shared button rule is what turned a descriptive service CTA
    // into an unshrinkable ~326px box and pushed the page sideways at 320px (Jira 10306).
    const buttonRule = /\.btn,\n(?:.*\n)*?\s*\.btn-text \{([\s\S]*?)\n {2}\}/.exec(css)?.[1] ?? ''
    expect(buttonRule).not.toMatch(/white-space:\s*nowrap/)
    expect(buttonRule).toMatch(/max-width: 100%/)
  })

  it('guarantees a 44px minimum touch target', () => {
    const buttonRule = /\.btn,\n(?:.*\n)*?\s*\.btn-text \{([\s\S]*?)\n {2}\}/.exec(css)?.[1] ?? ''
    expect(buttonRule).toMatch(/min-height: 2\.75rem/)
    // The compact size is shorter on a mouse pointer but restored on touch.
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\.btn-sm \{\s*min-height: 2\.75rem/)
    expect(css).toMatch(/\.btn-icon \{[\s\S]*?min-width: 2\.75rem/)
  })

  it('declares a visible focus style on every button variant', () => {
    expect(css).toMatch(/\.btn:focus-visible,[\s\S]*?outline: 2px dashed var\(--focus-ring\)/)
  })

  it('keeps its width while loading and stays labelled', () => {
    const { container, rerender } = render(<Button loading={false}>Add to cart</Button>)
    // A same-size placeholder is reserved even when not loading, so the button does not resize.
    expect(container.querySelector('span[aria-hidden="true"]')).not.toBeNull()
    rerender(
      <Button loading loadingLabel="Adding">
        Add to cart
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAccessibleName(/Add to cart/)
  })

  it('leaves a disabled label readable rather than fading it out', () => {
    expect(css).toMatch(/\.btn:disabled,[\s\S]*?color: var\(--action-disabled-ink\)/)
    const disabledRule = /\.btn:disabled,([\s\S]*?)\n {2}\}/.exec(css)?.[1] ?? ''
    expect(disabledRule).not.toMatch(/opacity/)
  })

  it('renders an action as a button and lets navigation stay a link', () => {
    render(
      <Button asChild>
        <a href="/products">Browse</a>
      </Button>,
    )
    const link = screen.getByRole('link', { name: 'Browse' })
    expect(link.className).toContain('btn-black')
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('card and surface system', () => {
  it.each(['.card', '.card-quiet', '.card-outline', '.card-inverse', '.card-interactive'])(
    'declares %s',
    (selector) => {
      expect(css).toContain(`${selector} {`)
    },
  )

  it('only lifts a card when motion is allowed', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{\s*\.card-interactive:hover \{\s*transform: translateY/,
    )
  })
})

describe('notices', () => {
  it.each([
    ['success' as const],
    ['warning' as const],
    ['danger' as const],
    ['info' as const],
    ['neutral' as const],
  ])('renders the %s tone with a written label, not colour alone', (tone) => {
    const { container } = render(
      <Notice tone={tone} title="Heads up">
        Something happened.
      </Notice>,
    )
    expect(container.textContent).toContain('Heads up')
    expect(container.textContent).toContain('Something happened.')
    // The glyph is decorative; the words carry the meaning.
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('is a live region only when asked to be', () => {
    const { rerender } = render(<Notice>Static page furniture</Notice>)
    expect(screen.queryByRole('status')).toBeNull()
    rerender(<Notice role="status">Now updating</Notice>)
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })
})

describe('empty and error states', () => {
  it('distinguishes empty, disabled and error', () => {
    const variants = (['empty', 'disabled', 'error'] as const).map((variant) => {
      const { container, unmount } = render(<EmptyState variant={variant} title={variant} />)
      const className = container.firstElementChild!.className
      unmount()
      return className
    })
    expect(new Set(variants).size).toBe(3)
    expect(variants[2]).toContain('danger')
  })

  it('offers a next action and keeps heading order controllable', () => {
    render(
      <EmptyState
        as="h2"
        title="No products are available online yet"
        body="Contact us and we can still help."
        actions={<a href="/contact">Contact Us</a>}
      />,
    )
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Contact Us' })).toBeInTheDocument()
  })

  it('uses an icon from the shared family, never an emoji', () => {
    const { container } = render(<EmptyState title="Nothing here" />)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.textContent).toBe('Nothing here')
  })
})

describe('status badges', () => {
  it('always renders text beside the glyph', () => {
    render(<StatusBadge tone="warning">Awaiting approval</StatusBadge>)
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument()
  })
})

describe('layout primitives', () => {
  it('applies one page container definition', () => {
    const { container } = render(<PageContainer>content</PageContainer>)
    expect(container.firstElementChild).toHaveClass('section-container')
    expect(css).toMatch(/\.section-container \{[\s\S]*?max-width: var\(--measure-page\)/)
  })

  it('gives sections a shared vertical rhythm and optional tone', () => {
    const { container } = render(
      <>
        <Section spacing="standard">a</Section>
        <Section spacing="tight" tone="alt">b</Section>
        <Section spacing="none" tone="inverse" divided>c</Section>
      </>,
    )
    const sections = [...container.querySelectorAll('section')]
    expect(sections[0].className).toContain('section-y')
    expect(sections[1].className).toContain('section-y-tight')
    expect(sections[1].className).toContain('surface-alt')
    expect(sections[2].className).toContain('surface-inverse')
    expect(sections[2].className).toContain('section-rule')
  })

  it('renders section headings at h2 by default and never skips to h1 by accident', () => {
    render(<SectionHeading eyebrow="Printing Services" title="What We Print" lead="Lead copy." />)
    expect(screen.getByRole('heading', { level: 2, name: 'What We Print' })).toBeInTheDocument()
    expect(screen.getByText('Printing Services')).toHaveClass('eyebrow')
  })

  it('caps the reading measure for long-form text', () => {
    const { container } = render(<ContentMeasure>text</ContentMeasure>)
    expect(container.firstElementChild).toHaveClass('content-measure')
  })

  it('always starts a card grid at one column so 320px cannot overflow', () => {
    const { container } = render(<CardGrid columns={4}>x</CardGrid>)
    expect(container.firstElementChild!.className).toContain('grid-cols-1')
  })

  it('lets a long action label wrap instead of forcing a scroll', () => {
    const { container } = render(<ActionGroup>x</ActionGroup>)
    expect(container.firstElementChild!.className).toContain('flex-wrap')
    expect(container.firstElementChild!.className).toContain('min-w-0')
  })

  it('adds no client component: every primitive is a server component', () => {
    for (const file of ['Layout.tsx', 'Notice.tsx', 'PageHero.tsx', 'Icon.tsx']) {
      expect(source('components', 'ui', file)).not.toMatch(/^'use client'/m)
    }
    expect(source('components', 'brand', 'BrandMark.tsx')).not.toMatch(/^'use client'/m)
  })
})

describe('page heroes', () => {
  it('gives different page types different treatments', () => {
    const shells = (['accent', 'inverse', 'plain'] as const).map((variant) => {
      const { container, unmount } = render(<PageHero variant={variant} title="Title" />)
      const className = container.querySelector('section')!.className
      unmount()
      return className
    })
    expect(new Set(shells).size).toBe(3)
    expect(shells[0]).toContain('hero-gradient')
    expect(shells[1]).toContain('surface-inverse')
    expect(shells[2]).not.toContain('hero-gradient')
  })

  it('renders the page h1 exactly once', () => {
    render(<PageHero title="Printing services" lead="Lead" eyebrow="Otahuhu" />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})

describe('icon system', () => {
  it('is one family: same viewBox, stroke and cap on every glyph', () => {
    const { container } = render(
      <>
        {ICON_NAMES.map((name) => (
          <Icon key={name} name={name} />
        ))}
      </>,
    )
    const svgs = [...container.querySelectorAll('svg')]
    expect(svgs).toHaveLength(ICON_NAMES.length)
    for (const svg of svgs) {
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
      expect(svg.getAttribute('stroke')).toBe('currentColor')
      expect(svg.getAttribute('stroke-width')).toBe('1.6')
      expect(svg.getAttribute('fill')).toBe('none')
    }
  })

  it('hides a decorative icon from assistive technology', () => {
    const { container } = render(<Icon name="printer" />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
    expect(svg.querySelector('title')).toBeNull()
  })

  it('gives a standalone icon an accessible name when one is supplied', () => {
    render(<Icon name="cart" title="Cart" />)
    expect(screen.getByRole('img', { name: 'Cart' })).toBeInTheDocument()
  })

  it('adds no icon dependency to the bundle', () => {
    // The icon set is JSX in this repository, so there is no third-party licence to record and
    // nothing that can pull a whole icon library into a route's First Load JS.
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(deps.filter((d) => /icon|lucide|heroicons|feather|phosphor|fontawesome/i.test(d))).toEqual([])
    expect(source('components', 'ui', 'Icon.tsx')).not.toMatch(/^import .* from '(?!react)/m)
  })
})

describe('brand mark', () => {
  it('renders the existing glyph and the configured name — no new logo', () => {
    render(<BrandMark />)
    expect(screen.getByText('Otahuhu Printing')).toBeInTheDocument()
  })

  it('preserves the exact printer path the header and footer already drew', () => {
    const { container } = render(<BrandGlyph />)
    expect(container.querySelector('path')!.getAttribute('d')).toBe(
      'M6 9V3h12v6M6 18H4a1 1 0 01-1-1v-5a2 2 0 012-2h14a2 2 0 012 2v5a1 1 0 01-1 1h-2M8 14h8v7H8v-7z',
    )
  })

  it('claims no slogan, trademark or combined identity', () => {
    // Comments in that file name the identities that must NOT be combined, so only the rendered
    // code is checked.
    const mark = source('components', 'brand', 'BrandMark.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(mark).not.toMatch(/™|®|Quality Canvas/)
    // The wordmark is configured text, not a hard-coded lockup.
    expect(mark).toMatch(/\{brandName\}/)
  })
})

describe('app icon assets', () => {
  const appDir = join(root, 'src', 'app')

  it.each(['icon.svg', 'apple-icon.png', 'favicon.ico'])('ships %s', (file) => {
    expect(existsSync(join(appDir, file))).toBe(true)
    expect(statSync(join(appDir, file)).size).toBeGreaterThan(0)
  })

  it('marks the icon as a documented placeholder rather than an approved logo', () => {
    const svg = readFileSync(join(appDir, 'icon.svg'), 'utf8')
    expect(svg).toMatch(/placeholder, NOT a new logo/i)
    // No wordmark: a full company name is unreadable at 16px and would assert an identity that
    // has not been approved.
    expect(svg).not.toMatch(/<text/)
    expect(svg).not.toMatch(/Otahuhu|Quality Canvas/i)
  })

  it('keeps every icon small enough not to matter to page weight', () => {
    for (const file of ['icon.svg', 'apple-icon.png', 'favicon.ico']) {
      expect(statSync(join(appDir, file)).size).toBeLessThan(20 * 1024)
    }
  })
})
