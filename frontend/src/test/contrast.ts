/**
 * WCAG 2.1 relative-luminance and contrast helpers (Jira 10307).
 *
 * Test-support only — nothing here ships. Used by `design-tokens.test.ts` to
 * assert real ratios over the values actually declared in `globals.css`, rather
 * than trusting a colour because it "looks dark enough".
 *
 * Alpha handling: a token like `rgba(255,255,255,0.86)` has no contrast on its
 * own, so `composite()` flattens it against the surface it is used on before the
 * ratio is taken. Skipping that step is how `text-white/55` on black came to be
 * treated as passing when it does not.
 */

export interface Rgb {
  r: number
  g: number
  b: number
  a: number
}

export function parseColour(input: string): Rgb {
  const value = input.trim()

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const digits = hex[1]
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((d) => d + d)
            .join('')
        : digits
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    }
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/i.exec(value)
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] === undefined ? 1 : Number(rgb[4]),
    }
  }

  throw new Error(`Unsupported colour value: ${input}`)
}

/** Flattens a translucent foreground onto an opaque background. */
export function composite(foreground: Rgb, background: Rgb): Rgb {
  const a = foreground.a
  return {
    r: foreground.r * a + background.r * (1 - a),
    g: foreground.g * a + background.g * (1 - a),
    b: foreground.b * a + background.b * (1 - a),
    a: 1,
  }
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function luminance(colour: Rgb): number {
  return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b)
}

/**
 * Contrast ratio of `foreground` over `background`. Both may be strings; a
 * translucent foreground is composited onto the background first.
 */
export function contrastRatio(foreground: string | Rgb, background: string | Rgb): number {
  const bg = typeof background === 'string' ? parseColour(background) : background
  const fgRaw = typeof foreground === 'string' ? parseColour(foreground) : foreground
  const fg = fgRaw.a < 1 ? composite(fgRaw, bg) : fgRaw
  const l1 = luminance(fg)
  const l2 = luminance(bg)
  const [lighter, darker] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (lighter + 0.05) / (darker + 0.05)
}

/** Rounded to 2dp for readable assertion failures. */
export function ratio(foreground: string | Rgb, background: string | Rgb): number {
  return Math.round(contrastRatio(foreground, background) * 100) / 100
}
