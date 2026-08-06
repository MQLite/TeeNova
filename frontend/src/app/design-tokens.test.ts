import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { composite, parseColour, ratio } from '@/test/contrast'

/**
 * Design-token contract (Jira 10307).
 *
 * These tests read the values actually shipped in `globals.css` and
 * `tailwind.config.ts`. They are not a substitute for looking at the site — a
 * token pair can pass every ratio here and still be an ugly page — but they do
 * make three specific regressions impossible to merge silently:
 *
 *   1. re-declaring a font family the repository does not load;
 *   2. lightening a text token below its WCAG AA ratio;
 *   3. putting white type back on the raw rainbow gradient.
 */

// `process.cwd()` is the frontend root under `npm test` but `src` under a filtered `vitest run`,
// so the frontend root is located rather than assumed.
const frontendRoot = (): string => {
  for (const candidate of [process.cwd(), join(process.cwd(), '..'), join(process.cwd(), '..', '..')]) {
    if (existsSync(join(candidate, 'tailwind.config.ts'))) return candidate
  }
  throw new Error('Could not locate the frontend root from ' + process.cwd())
}
const root = frontendRoot()
/**
 * These files document, in comments, exactly the constructs the assertions
 * forbid ("no `@font-face` rule or `next/font` import ever existed"). The
 * assertions are about declarations, so comments are removed first.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const css = stripComments(readFileSync(join(root, 'src', 'app', 'globals.css'), 'utf8'))
const tailwind = stripComments(readFileSync(join(root, 'tailwind.config.ts'), 'utf8'))
const layout = stripComments(readFileSync(join(root, 'src', 'app', 'layout.tsx'), 'utf8'))

/** Extracts a custom property declared in the `:root` block. */
function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css)
  if (!match) throw new Error(`Missing design token --${name}`)
  return match[1].trim()
}

const CANVAS = token('canvas')
const SURFACE = token('surface')
const INVERSE = token('surface-inverse')

describe('token catalogue', () => {
  const REQUIRED = [
    // Surfaces
    'canvas', 'canvas-alt', 'surface', 'surface-sunken', 'surface-inverse',
    // Ink
    'ink', 'ink-secondary', 'ink-muted', 'ink-inverse', 'ink-inverse-secondary',
    'ink-inverse-muted', 'ink-on-accent', 'ink-on-accent-muted',
    // Borders
    'border', 'border-strong', 'border-control', 'border-inverse',
    // Actions
    'action', 'action-hover', 'action-ink', 'action-secondary', 'action-danger',
    'action-disabled-ink', 'action-disabled-surface', 'focus-ring', 'focus-ring-inverse',
    // Accent
    'accent', 'accent-hover', 'accent-soft', 'accent-gradient', 'accent-scrim',
    // Status
    'success-ink', 'success-surface', 'success-border',
    'warning-ink', 'warning-surface', 'warning-border',
    'danger-ink', 'danger-surface', 'danger-border',
    'info-ink', 'info-surface', 'info-border',
    // Typography
    'font-sans', 'font-mono', 'weight-regular', 'weight-medium', 'weight-semibold', 'weight-bold',
    'text-display', 'text-h1', 'text-h2', 'text-h3',
    'text-body-lg', 'text-body', 'text-body-sm', 'text-label', 'text-caption', 'text-price',
    'line-tight', 'line-body', 'line-relaxed', 'track-body', 'track-mono',
    // Spacing and measure
    'space-gutter', 'space-section-y', 'space-section-y-lg', 'space-card-p',
    'space-field-gap', 'space-grid-gap', 'space-sticky-clearance',
    'measure-content', 'measure-wide', 'measure-page',
    // Shape and elevation
    'radius-sm', 'radius', 'radius-lg', 'radius-xl', 'radius-pill',
    'shadow-subtle', 'shadow-hover', 'shadow-dialog', 'shadow-sticky',
    // Motion
    'motion-fast', 'motion', 'motion-slow', 'ease',
  ]

  it.each(REQUIRED)('declares --%s', (name) => {
    expect(() => token(name)).not.toThrow()
  })

  it('names tokens semantically rather than by colour', () => {
    // A `--grey-500` style token forces every caller to re-decide what it means.
    const declared = [...css.matchAll(/^\s*--([a-z0-9-]+):/gm)].map((m) => m[1])
    const colourNamed = declared.filter((name) =>
      /^(grey|gray|red|blue|green|yellow|purple|pink|orange)\b/.test(name),
    )
    expect(colourNamed).toEqual([])
  })
})

describe('typography strategy', () => {
  it('no longer declares the never-loaded figma font families', () => {
    // `figmaSans` / `figmaMono` were named in globals.css, tailwind.config.ts and two component
    // classes, but no font file, @font-face rule or next/font import ever existed.
    for (const source of [css, tailwind, layout]) {
      expect(source).not.toMatch(/figmaSans|figmaMono/)
    }
  })

  it('loads no webfont: the declared stack is the stack that renders', () => {
    // A system stack is self-hosted by definition — no third-party font CDN sees a visitor's IP,
    // no transfer bytes, and no swap that could shift layout.
    expect(css).not.toMatch(/@font-face/)
    expect(layout).not.toMatch(/next\/font/)
    const sans = token('font-sans')
    expect(sans).toMatch(/system-ui/)
    expect(sans).toMatch(/-apple-system/)
    expect(sans).toMatch(/Segoe UI/)
  })

  it('carries a CJK fallback so non-Latin content does not drop to a serif default', () => {
    const sans = token('font-sans')
    expect(sans).toMatch(/PingFang SC|Noto Sans CJK|Microsoft YaHei/)
  })

  it('uses only weights a system face can actually render', () => {
    // The previous scale asked for 320 / 330 / 340 / 450 / 480 / 540, which browsers rounded or
    // synthesised.
    for (const name of ['weight-regular', 'weight-medium', 'weight-semibold', 'weight-bold']) {
      expect(['400', '500', '600', '700']).toContain(token(name))
    }
    const weights = /fontWeight: \{([\s\S]*?)\n {6}\}/.exec(tailwind)?.[1] ?? ''
    const declared = [...weights.matchAll(/'(\d+)'/g)].map((m) => m[1])
    expect(declared.length).toBeGreaterThan(0)
    for (const weight of declared) expect(['400', '500', '600', '700']).toContain(weight)
  })

  it('makes form controls inherit page typography', () => {
    // Browsers substitute their own UI font and size on inputs unless told not to.
    const block = /input,\s*\n\s*textarea,\s*\n\s*select,\s*\n\s*button \{([\s\S]*?)\}/.exec(css)?.[1]
    expect(block).toBeDefined()
    expect(block).toMatch(/font-family: inherit/)
    expect(block).toMatch(/font-size: inherit/)
  })
})

describe('contrast — text on the warm canvas', () => {
  it.each([
    ['ink', 4.5],
    ['ink-secondary', 4.5],
    ['ink-muted', 4.5],
    ['accent', 4.5],
  ])('--%s meets %s:1 on --canvas', (name, minimum) => {
    expect(ratio(token(name), CANVAS)).toBeGreaterThanOrEqual(minimum)
  })

  it.each([['ink'], ['ink-secondary'], ['ink-muted']])(
    '--%s also meets AA on --surface',
    (name) => {
      expect(ratio(token(name), SURFACE)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('keeps a disabled control legible rather than fading it to nothing', () => {
    // `opacity-40` on a black label lands near 1.7:1; a customer who cannot read a disabled field
    // cannot tell what is disabled.
    const surface = composite(parseColour(token('action-disabled-surface')), parseColour(CANVAS))
    expect(ratio(token('action-disabled-ink'), surface)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('contrast — text on dark and accent surfaces', () => {
  it.each([
    ['ink-inverse', 4.5],
    ['ink-inverse-secondary', 4.5],
    // Muted inverse text is used for supporting captions only, at the 3:1 UI threshold.
    ['ink-inverse-muted', 3],
  ])('--%s meets %s:1 on --surface-inverse', (name, minimum) => {
    expect(ratio(token(name), INVERSE)).toBeGreaterThanOrEqual(minimum)
  })

  it('keeps white type readable over the brightest gradient stop', () => {
    // Worst case is #ffe033. Composited under the scrim, both the primary and the muted
    // on-accent inks must still pass — this is the check that the previous unscrimmed
    // `.hero-gradient` failed at roughly 1.1:1.
    const brightestStop = parseColour('#ffe033')
    const scrimmed = composite(parseColour(token('accent-scrim')), brightestStop)
    expect(ratio(token('ink-on-accent'), scrimmed)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(token('ink-on-accent-muted'), scrimmed)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('contrast — non-text', () => {
  it('gives interactive boundaries the 3:1 UI-component ratio', () => {
    expect(ratio(token('border-control'), CANVAS)).toBeGreaterThanOrEqual(3)
    expect(ratio(token('border-control'), SURFACE)).toBeGreaterThanOrEqual(3)
  })

  it('gives the focus ring enough contrast on both canvases', () => {
    expect(ratio(token('focus-ring'), CANVAS)).toBeGreaterThanOrEqual(3)
    expect(ratio(token('focus-ring-inverse'), INVERSE)).toBeGreaterThanOrEqual(3)
  })

  it.each([
    ['success'],
    ['warning'],
    ['danger'],
    ['info'],
  ])('%s notice text passes AA on its own tint', (status) => {
    expect(ratio(token(`${status}-ink`), token(`${status}-surface`))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('colour strategy', () => {
  it('keeps the warm canvas and near-black ink hierarchy', () => {
    expect(parseColour(CANVAS).r).toBeGreaterThan(parseColour(CANVAS).b) // warm, not blue-white
    expect(CANVAS).not.toBe('#ffffff')
    expect(ratio(token('ink'), CANVAS)).toBeGreaterThan(15)
  })

  it('keeps the gradient a bounded accent rather than a page background', () => {
    // The gradient is reachable only through `.hero-gradient` (scrimmed, for hero bands) and
    // `.accent-rule` (a 3px decorative strip). Nothing else may consume it.
    const consumers = [...css.matchAll(/([\w.-]+)\s*\{[^}]*var\(--accent-gradient\)/g)].map(
      (m) => m[1],
    )
    expect(new Set(consumers)).toEqual(new Set(['.hero-gradient', '.accent-rule']))
  })

  it('always scrims the gradient where text sits on it', () => {
    const heroRule = /\.hero-gradient \{([\s\S]*?)\n {2}\}/.exec(css)?.[1] ?? ''
    expect(heroRule).toMatch(/var\(--accent-scrim\)/)
    expect(heroRule).toMatch(/var\(--accent-gradient\)/)
  })
})

describe('motion', () => {
  it('honours prefers-reduced-motion globally', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
    expect(block).toMatch(/animation-duration: 0\.01ms !important/)
    expect(block).toMatch(/transition-duration: 0\.01ms !important/)
    expect(block).toMatch(/scroll-behavior: auto !important/)
  })

  it('drives every transition from a motion token so the override reaches all of them', () => {
    const durations = [...css.matchAll(/transition:[^;]*?(\d+m?s)\b/g)].map((m) => m[1])
    expect(durations).toEqual([])
  })
})

describe('shape and elevation', () => {
  it('exposes a full radius ladder including a pill', () => {
    expect(token('radius-pill')).toBe('9999px')
    const ladder = ['radius-sm', 'radius', 'radius-lg', 'radius-xl'].map((n) =>
      parseInt(token(n), 10),
    )
    expect(ladder).toEqual([...ladder].sort((a, b) => a - b))
  })

  it('separates card, hover, dialog and sticky elevation', () => {
    const shadows = ['shadow-subtle', 'shadow-hover', 'shadow-dialog', 'shadow-sticky'].map(token)
    expect(new Set(shadows).size).toBe(4)
    // The sticky bar casts upward, everything else downward.
    expect(token('shadow-sticky')).toMatch(/0 -\d/)
  })
})

describe('tailwind theme', () => {
  it('re-exports tokens rather than restating values', () => {
    const theme = /theme: \{([\s\S]*)\n {2}\},/.exec(tailwind)?.[1] ?? ''
    const literals = [...theme.matchAll(/'(#[0-9a-f]{3,8})'/gi)].map((m) => m[1])
    // The only literals left are the retained Admin `glass` / `status` badge colours.
    const statusBlock = /status: \{([\s\S]*?)\},/.exec(theme)?.[1] ?? ''
    for (const literal of literals) {
      expect(statusBlock).toContain(literal)
    }
  })
})
