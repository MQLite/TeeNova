/**
 * Generates the site's default social-sharing card (Jira 10308 Phase 7).
 *
 *     node scripts/generate-og-image.mjs
 *
 * Writes `public/og-default.png` (1200×630). Its alt text lives in `lib/seo/identity.ts` as
 * `defaultSocialImage`, which is what every route's metadata references.
 *
 * ## Why the card is a committed asset rather than a generated route
 *
 * The obvious implementation is `app/opengraph-image.tsx` returning an `ImageResponse`. It was
 * written that way first and does work — but Next 14.2's bundled `@vercel/og` node build resolves
 * its own font and wasm files with `fileURLToPath(join(import.meta.url, '../…'))`, and `path.join`
 * mangles a `file:///D:/…` URL into `file:\D:\…` on Windows. The route therefore fails to prerender
 * on any Windows machine — `TypeError: Invalid URL` during `next build` — while building fine on the
 * Linux production host. A build that only succeeds on one of the two platforms the team uses is a
 * defect, not a portability footnote.
 *
 * The `edge` runtime avoids the bug (it loads the wasm build) but disables static generation, so the
 * card would be rasterized on every crawler fetch instead of once. Both were rejected.
 *
 * A second problem ruled the file convention out independently: a root `opengraph-image` did not
 * reach routes that declare their own `openGraph` block, which is every public route here, so only
 * the homepage carried a card. Runtime evidence, not a guess — it was observed against a production
 * build before the approach changed.
 *
 * A committed PNG referenced explicitly is deterministic, costs nothing at request time, cannot fail
 * at runtime, applies to every route through one code path, and is exactly the "static neutral
 * default card" the task allows. This script keeps it reproducible and reviewable: the design lives
 * here in source, not only in the binary.
 *
 * ## What the card deliberately is not
 *
 *   • Not a logo. No approved logo exists (Jira 10300 A34). The glyph below is the printer mark
 *     already in the repository (`components/brand/BrandMark.tsx`), at icon scale beside the name,
 *     exactly as the header shows it — not a designed lockup.
 *   • Not the favicon. `app/apple-icon.png` and `app/favicon.ico` are documented placeholders; a
 *     favicon blown up to 1200×630 reads as the company's logo, which is the one thing it must not
 *     be taken for.
 *   • No slogan. The site has never had one, and inventing a line of positioning copy for a sharing
 *     card is the same category of fabrication as inventing an opening hour.
 *   • No photography. The only imagery the business has rights to is Published portfolio work, and
 *     none exists yet.
 *   • No legal name. "Quality Canvas Ltd" has never been customer-facing (A02).
 *
 * Text and colours restate what the site already says: the brand name, what is printed, and the
 * suburb. Colours are the semantic tokens `--surface-inverse`, `--ink-inverse` and
 * `--ink-inverse-secondary`, written as literals because this renderer does not read the stylesheet.
 *
 * ## The patched module copy
 *
 * To render at all on Windows, the script writes a copy of the compiled `@vercel/og` entry point
 * beside the original with those three path expressions corrected, imports it, and deletes it again.
 * The copy has to sit in the same directory so the relative font and wasm reads still resolve. It
 * touches only `node_modules`, which is regenerable and untracked, and it is removed in a `finally`.
 */

import { createElement as h } from 'react'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const frontendRoot = join(here, '..')
const require = createRequire(import.meta.url)

const OG_DIR = join(
  dirname(require.resolve('next/package.json')),
  'dist',
  'compiled',
  '@vercel',
  'og',
)
const ORIGINAL = join(OG_DIR, 'index.node.js')
const PATCHED = join(OG_DIR, 'index.node.og-fix.mjs')

const OUTPUT_PNG = join(frontendRoot, 'public', 'og-default.png')

const WIDTH = 1200
const HEIGHT = 630

// Kept in step with `lib/site-brand.ts`. The card is a build artifact, so it carries the default
// public name; a deployment that configures a different `NEXT_PUBLIC_BRAND_FULL_NAME` regenerates it.
const BRAND_FULL_NAME = 'Otahuhu Printing Shop'
const HEADLINE = 'Custom printing in Auckland'
const SUBHEAD = 'T-shirts, badges, banners, business cards, stickers and signage'
const LOCATION = 'Otahuhu, Auckland'

const ALT_TEXT = `${BRAND_FULL_NAME} — custom printing in Otahuhu, Auckland`

function card() {
  return h(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#0a0a0a',
        padding: '72px',
        fontFamily: 'sans-serif',
      },
    },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center' } },
      h(
        'svg',
        {
          width: 56,
          height: 56,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: '#ffffff',
          strokeWidth: 1.75,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        h('path', {
          d: 'M6 9V3h12v6M6 18H4a1 1 0 01-1-1v-5a2 2 0 012-2h14a2 2 0 012 2v5a1 1 0 01-1 1h-2M8 14h8v7H8v-7z',
        }),
      ),
      h(
        'div',
        { style: { display: 'flex', marginLeft: 20, fontSize: 34, color: '#ffffff', fontWeight: 600 } },
        BRAND_FULL_NAME,
      ),
    ),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column' } },
      h(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: 84,
            lineHeight: 1.05,
            color: '#ffffff',
            fontWeight: 700,
            letterSpacing: '-2px',
          },
        },
        HEADLINE,
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            marginTop: 28,
            fontSize: 34,
            lineHeight: 1.3,
            color: 'rgba(255, 255, 255, 0.86)',
          },
        },
        SUBHEAD,
      ),
    ),
    h('div', { style: { display: 'flex', fontSize: 28, color: 'rgba(255, 255, 255, 0.72)' } }, LOCATION),
  )
}

/** Copy of the compiled entry point with the three Windows-hostile path expressions corrected. */
function writePatchedModule() {
  const source = readFileSync(ORIGINAL, 'utf8')
  const patched = source.replace(
    /fileURLToPath\(join\(import\.meta\.url, "\.\.\/([^"]+)"\)\)/g,
    'new URL("./$1", import.meta.url)',
  )
  if (patched === source) {
    throw new Error(
      'The @vercel/og path expressions this script patches were not found. Re-check whether the ' +
        'upstream bug is fixed — if it is, delete this script and use app/opengraph-image.tsx.',
    )
  }
  writeFileSync(PATCHED, patched)
}

async function main() {
  writePatchedModule()
  try {
    const { ImageResponse } = await import(pathToFileURL(PATCHED).href)
    const response = new ImageResponse(card(), { width: WIDTH, height: HEIGHT })
    const bytes = Buffer.from(await response.arrayBuffer())
    writeFileSync(OUTPUT_PNG, bytes)
    console.log(`Wrote ${OUTPUT_PNG} (${WIDTH}x${HEIGHT}, ${bytes.length} bytes)`)
    console.log(`Alt text lives in lib/seo/identity.ts and must read: ${ALT_TEXT}`)
  } finally {
    if (existsSync(PATCHED)) unlinkSync(PATCHED)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
