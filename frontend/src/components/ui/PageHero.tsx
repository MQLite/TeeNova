import type { ReactNode } from 'react'
import { PageContainer } from './Layout'

/**
 * Page-type hero compositions (Jira 10307).
 *
 * The audit found the same rainbow `hero-gradient` band on the homepage, the
 * service index, the quote page and the homepage CTA — four different page types
 * with one identical treatment, which left no visual signal about where you
 * were. Three variants now carry that signal:
 *
 *   `accent`  — the gradient, scrimmed. Reserved for the homepage hero and one
 *               closing CTA band. This is the only place the rainbow appears at
 *               full height.
 *   `inverse` — a black band. Section-entry pages (`/services`, `/quote`) where
 *               the page is a gateway rather than the destination.
 *   `plain`   — warm canvas under a thin gradient rule. Working and reading
 *               pages (`/products`, `/portfolio`, policies) where the content,
 *               not the chrome, should hold attention.
 *
 * Server component. The homepage hero is deliberately *not* built from this —
 * its compact-mobile spacing is a Jira 10305 acceptance criterion asserted
 * against the literal `py-8 sm:py-24 lg:py-36` classes, and hiding those behind
 * a variant would make that guarantee invisible at the call site.
 */

export type HeroVariant = 'accent' | 'inverse' | 'plain'

interface PageHeroProps {
  variant?: HeroVariant
  eyebrow?: string
  /** Page title. Rendered as the page's single `h1`. */
  title: ReactNode
  lead?: ReactNode
  /** Breadcrumb or back-link, rendered above the eyebrow. */
  above?: ReactNode
  /** Primary/secondary actions. */
  actions?: ReactNode
  align?: 'start' | 'center'
  className?: string
}

const SHELL: Record<HeroVariant, string> = {
  accent: 'hero-gradient',
  inverse: 'surface-inverse',
  plain: 'border-b border-line bg-canvas',
}

export function PageHero({
  variant = 'plain',
  eyebrow,
  title,
  lead,
  above,
  actions,
  align = 'start',
  className = '',
}: PageHeroProps) {
  const onDark = variant !== 'plain'
  const centered = align === 'center'

  return (
    <section className={`${SHELL[variant]} ${className}`}>
      {variant === 'plain' && <div className="accent-rule" aria-hidden="true" />}
      <PageContainer>
        <div
          className={`py-10 sm:py-14 lg:py-16 ${
            centered ? 'mx-auto max-w-measure-wide text-center' : 'max-w-measure-wide'
          }`}
        >
          {above && <div className="mb-5">{above}</div>}
          {eyebrow && (
            <p className={`eyebrow mb-4 ${onDark ? 'eyebrow-on-accent' : ''}`}>{eyebrow}</p>
          )}
          <h1 className={`display-page ${onDark ? 'text-ink-inverse' : ''}`}>{title}</h1>
          {lead && (
            <p
              className={`mt-5 max-w-measure text-base leading-relaxed sm:text-[1.0625rem] ${
                centered ? 'mx-auto' : ''
              } ${onDark ? 'text-ink-on-accent-muted' : 'text-ink-secondary'}`}
            >
              {lead}
            </p>
          )}
          {actions && (
            <div
              className={`mt-8 flex min-w-0 flex-wrap gap-3 ${centered ? 'justify-center' : ''}`}
            >
              {actions}
            </div>
          )}
        </div>
      </PageContainer>
    </section>
  )
}
