import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Header and footer (Jira 10307 presentation pass).
 *
 * The behavioural contracts these protect were set by earlier tasks and must
 * survive a restyle: the Services route (10306), no Draft links and no
 * `/customize` link (10303/10306), no payment badges and no shipping claim
 * (10303), and the published-registry-derived link lists.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/products' }))

const frontendRoot = (): string => {
  for (const candidate of [process.cwd(), join(process.cwd(), '..'), join(process.cwd(), '..', '..')]) {
    if (existsSync(join(candidate, 'tailwind.config.ts'))) return candidate
  }
  throw new Error('Could not locate the frontend root from ' + process.cwd())
}
const root = frontendRoot()
const source = (...parts: string[]) => readFileSync(join(root, 'src', ...parts), 'utf8')
/** Several of these files discuss the forbidden construct in a comment. */
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

describe('header', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  const renderHeader = async () => {
    const { Header } = await import('./Header')
    return render(<Header />)
  }

  it('keeps the Services route pointing at the real index', async () => {
    await renderHeader()
    expect(screen.getAllByRole('link', { name: 'Services' })[0]).toHaveAttribute('href', '/services')
  })

  it('links the brand mark home with an accessible name', async () => {
    await renderHeader()
    const home = screen.getByRole('link', { name: /home/i })
    expect(home).toHaveAttribute('href', '/')
  })

  it('marks the current route without relying on colour alone', async () => {
    await renderHeader()
    const current = screen.getAllByRole('link', { name: 'Products' })[0]
    expect(current).toHaveAttribute('aria-current', 'page')
  })

  it('names the cart control even when the badge is absent', async () => {
    await renderHeader()
    expect(screen.getByRole('link', { name: /cart/i })).toHaveAttribute('href', '/cart')
  })

  it('exposes mobile menu state and closes on Escape, returning focus', async () => {
    const user = userEvent.setup()
    await renderHeader()
    const toggle = screen.getByRole('button', { name: 'Open menu' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'mobile-nav')

    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById('mobile-nav')).not.toBeNull()

    await user.keyboard('{Escape}')
    expect(document.getElementById('mobile-nav')).toBeNull()
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveFocus()
  })

  it('uses icons from the shared family rather than emoji', async () => {
    const { container } = await renderHeader()
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0)
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  it('links to no Draft route and no /customize placeholder', async () => {
    const { container } = await renderHeader()
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).not.toContain('/customize')
    for (const href of hrefs) {
      expect(href).not.toMatch(/\/policies\/(privacy|terms|returns|payment-terms)/)
    }
  })

  it('does not add a body-scroll lock that can leak', async () => {
    const user = userEvent.setup()
    await renderHeader()
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(document.body.style.overflow).toBe('')
    expect(source('components', 'layout', 'Header.tsx')).not.toMatch(/document\.body\.style/)
  })
})

describe('footer', () => {
  const renderFooter = async () => {
    const { Footer } = await import('./Footer')
    return render(<Footer />)
  }

  it('keeps removed payment badges and shipping claims absent', async () => {
    const { container } = await renderFooter()
    const text = container.textContent!.toLowerCase()
    for (const claim of [
      'eftpos',
      'bank transfer',
      'free shipping',
      'nz wide',
      'nationwide',
      'fast turnaround',
      'money back',
      'guarantee',
    ]) {
      expect(text).not.toContain(claim)
    }
  })

  it('never renders the invalid mailbox spelling', async () => {
    const { container } = await renderFooter()
    // Reconstructed so this file cannot itself become a source of the typo.
    const invalid = ['quanlity', 'canvasltd@gmail.com'].join('')
    expect(container.innerHTML).not.toContain(invalid)
  })

  it('lists only published help and policy documents', async () => {
    const { publishedDocuments } = await import('@/lib/public-content/registry')
    await renderFooter()
    const nav = screen.getByRole('navigation', { name: 'Help and policies' })
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(labels.sort()).toEqual(publishedDocuments().map((d) => d.title).sort())
  })

  it('renders no empty column and no dead link', async () => {
    const { container } = await renderFooter()
    for (const link of container.querySelectorAll('a')) {
      const href = link.getAttribute('href')
      expect(href).toBeTruthy()
      expect(href).not.toBe('#')
    }
    for (const list of container.querySelectorAll('ul')) {
      expect(list.querySelectorAll('li').length).toBeGreaterThan(0)
    }
  })

  /**
   * Jira 10307 rendered the sentence "Find us on Facebook and Instagram" as inert text, because no
   * verified profile URL existed and a `#` link would have been worse. Jira 10308 replaced that with
   * configuration: with nothing configured — the state today, approvals A39/A40 — the block renders
   * nothing at all, which is a stronger result than an unactionable sentence. The name of a platform
   * the site cannot link to must not appear either.
   */
  it('renders no social profile link, and no unactionable social label, without verified URLs', async () => {
    const { container } = await renderFooter()
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '')
    expect(hrefs.filter((h) => /facebook|instagram|linkedin|youtube/i.test(h))).toEqual([])
    expect(hrefs.filter((h) => h === '' || h === '#')).toEqual([])
    expect(container.textContent).not.toMatch(/Facebook|Instagram/i)
  })

  it('uses the inverse ink tokens rather than an unmeasured white opacity', async () => {
    // `text-white/55` on the black band is roughly 3.9:1 — below AA at body size.
    const footer = stripComments(source('components', 'layout', 'Footer.tsx'))
    expect(footer).not.toMatch(/text-white\/\d+/)
    expect(footer).toMatch(/text-ink-inverse-secondary/)
  })
})

describe('root layout', () => {
  it('provides a skip link as the first focusable element', () => {
    const layout = source('app', 'layout.tsx')
    expect(layout).toMatch(/skip-link/)
    expect(layout).toMatch(/href="#main-content"/)
    expect(layout).toMatch(/id="main-content"/)
  })

  it('owns the single main landmark', () => {
    const layout = source('app', 'layout.tsx')
    expect([...layout.matchAll(/<main\b/g)]).toHaveLength(1)
  })

  it('has no public page rendering a nested main landmark', () => {
    // Two `main` regions on one page is a landmark defect; before Jira 10307 seven public routes
    // rendered their own inside the layout's. Admin has its own shell and is out of scope for
    // this epic.
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'admin') continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.tsx$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          if (/<main\b/.test(stripComments(readFileSync(full, 'utf8')))) offenders.push(full)
        }
      }
    }
    walk(join(root, 'src', 'app', 'cart'))
    walk(join(root, 'src', 'app', 'checkout'))
    walk(join(root, 'src', 'app', 'contact'))
    walk(join(root, 'src', 'app', 'help'))
    walk(join(root, 'src', 'app', 'policies'))
    walk(join(root, 'src', 'app', 'portfolio'))
    walk(join(root, 'src', 'app', 'products'))
    walk(join(root, 'src', 'app', 'quote'))
    walk(join(root, 'src', 'app', 'services'))
    walk(join(root, 'src', 'components', 'content'))
    walk(join(root, 'src', 'components', 'portfolio'))
    walk(join(root, 'src', 'components', 'products'))
    walk(join(root, 'src', 'components', 'services'))
    walk(join(root, 'src', 'components', 'ui'))
    expect(offenders).toEqual([])
  })
})
