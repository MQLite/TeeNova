import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Jira 10306 — `/customize` resolution.
 *
 * The route used to render an unbuilt "Design Studio … coming soon" placeholder and was linked from
 * the homepage and the footer as **Bring Your Own Garment**. It now permanently redirects to the
 * real service page, and the redirect target is resolved through the publication gate so it can
 * never point at a page that would 404.
 *
 * These tests live in their own file because they replace a content module for one case; keeping
 * that module substitution away from the shared registry assertions in the service test files.
 */

const repoFile = (relative: string) => readFileSync(resolve(__dirname, '../../../..', relative), 'utf8')

/** Comments are stripped: the route's own comment quotes the placeholder text it removed. */
const repoCode = (relative: string) =>
  repoFile(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

afterEach(() => {
  vi.doUnmock('@/content/services/bring-your-own-garment')
  vi.doUnmock('next/navigation')
  vi.resetModules()
})

describe('/customize', () => {
  it('permanently redirects to the published Bring Your Own Garment service page', async () => {
    const redirects: string[] = []
    vi.doMock('next/navigation', () => ({
      permanentRedirect: (target: string) => {
        redirects.push(target)
        throw new Error('NEXT_REDIRECT')
      },
      notFound: () => {
        throw new Error('NEXT_NOT_FOUND')
      },
    }))
    const { default: CustomizePage } = await import('./page')
    expect(() => CustomizePage()).toThrow('NEXT_REDIRECT')
    expect(redirects).toEqual(['/services/bring-your-own-garment'])
  })

  it('404s rather than redirecting to a page that would itself 404', async () => {
    vi.doMock('@/content/services/bring-your-own-garment', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/content/services/bring-your-own-garment')>()
      return { bringYourOwnGarmentService: { ...actual.bringYourOwnGarmentService, status: 'draft' } }
    })
    const events: string[] = []
    vi.doMock('next/navigation', () => ({
      permanentRedirect: (target: string) => {
        events.push(`redirect:${target}`)
        throw new Error('NEXT_REDIRECT')
      },
      notFound: () => {
        events.push('notFound')
        throw new Error('NEXT_NOT_FOUND')
      },
    }))
    const { default: CustomizePage } = await import('./page')
    expect(() => CustomizePage()).toThrow('NEXT_NOT_FOUND')
    expect(events).toEqual(['notFound'])
  })

  it('no longer renders the unfinished Design Studio placeholder', () => {
    const source = repoCode('frontend/src/app/customize/page.tsx')
    expect(source).not.toMatch(/Canvas Editor Placeholder|Fabric\.js|Konva|coming soon|Design Studio/i)
    expect(source).toContain('permanentRedirect')
  })

  it('is marked non-indexable', async () => {
    vi.doMock('next/navigation', () => ({
      permanentRedirect: () => {
        throw new Error('NEXT_REDIRECT')
      },
      notFound: () => {
        throw new Error('NEXT_NOT_FOUND')
      },
    }))
    const { metadata } = await import('./page')
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('is not linked from any public navigation surface', () => {
    for (const file of [
      'frontend/src/app/page.tsx',
      'frontend/src/components/layout/Footer.tsx',
      'frontend/src/components/layout/Header.tsx',
      'frontend/src/app/services/page.tsx',
      'frontend/src/app/contact/page.tsx',
      'frontend/src/app/products/page.tsx',
    ]) {
      expect(repoCode(file), `${file} still links /customize`).not.toContain('/customize')
    }
  })
})
