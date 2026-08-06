import type { ElementType, HTMLAttributes, ReactNode } from 'react'

/**
 * Shared public layout primitives (Jira 10307).
 *
 * These exist to remove three specific duplications the audit found: a
 * `mx-auto max-w-6xl px-4 sm:px-6 lg:px-8` wrapper repeated 37 times, section
 * padding written as an ad-hoc `py-*` pair on every section, and a heading
 * eyebrow/title/lead trio re-typed on every page.
 *
 * All server components — nothing here needs state, an effect or an event
 * handler, so none of it moves a page across the client boundary.
 *
 * Deliberately NOT abstracted: hero compositions (they differ by page type,
 * see `PageHero`), product cards, service cards, and the configurator surfaces.
 * Those differ materially in behaviour, not just in class strings.
 */

type DivProps = HTMLAttributes<HTMLDivElement>

/** Page gutters and maximum width. One definition, used by every public route. */
export function PageContainer({ className = '', children, ...props }: DivProps) {
  return (
    <div className={`section-container ${className}`} {...props}>
      {children}
    </div>
  )
}

interface SectionProps extends HTMLAttributes<HTMLElement> {
  /** Vertical rhythm. `tight` is ~70% of standard; `none` opts out entirely. */
  spacing?: 'standard' | 'tight' | 'none'
  /** Background treatment. `inverse` is the black band; `alt` the warm tint. */
  tone?: 'canvas' | 'alt' | 'inverse'
  /** Hairline rule above the section, for adjacent same-tone sections. */
  divided?: boolean
  /** Constrain content to the page container. Set false to lay out edge-to-edge. */
  contained?: boolean
  as?: ElementType
}

const SPACING: Record<NonNullable<SectionProps['spacing']>, string> = {
  standard: 'section-y',
  tight: 'section-y-tight',
  none: '',
}

const TONE: Record<NonNullable<SectionProps['tone']>, string> = {
  canvas: '',
  alt: 'surface-alt',
  inverse: 'surface-inverse',
}

export function Section({
  spacing = 'standard',
  tone = 'canvas',
  divided = false,
  contained = true,
  as: Tag = 'section',
  className = '',
  children,
  ...props
}: SectionProps) {
  const classes = [SPACING[spacing], TONE[tone], divided ? 'section-rule' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <Tag className={classes} {...props}>
      {contained ? <PageContainer>{children}</PageContainer> : children}
    </Tag>
  )
}

interface SectionHeadingProps {
  /** Small uppercase label above the title. Never the only description of the section. */
  eyebrow?: string
  title: ReactNode
  lead?: ReactNode
  /** Heading level. Pages own their single `h1`; sections default to `h2`. */
  as?: 'h1' | 'h2' | 'h3'
  align?: 'start' | 'center'
  tone?: 'default' | 'inverse'
  id?: string
  className?: string
  /** Right-aligned affordance on wide screens, e.g. a "View all" link. */
  action?: ReactNode
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  as: Tag = 'h2',
  align = 'start',
  tone = 'default',
  id,
  className = '',
  action,
}: SectionHeadingProps) {
  const inverse = tone === 'inverse'
  const centered = align === 'center'
  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${
        centered ? 'sm:flex-col sm:items-center' : ''
      } ${className}`}
    >
      <div className={`max-w-measure-wide ${centered ? 'mx-auto text-center' : ''}`}>
        {eyebrow && (
          <p className={`eyebrow mb-3 ${inverse ? 'eyebrow-inverse' : ''}`}>{eyebrow}</p>
        )}
        <Tag
          id={id}
          className={`${Tag === 'h1' ? 'display-page' : 'display-section'} ${
            inverse ? 'text-ink-inverse' : ''
          }`}
        >
          {title}
        </Tag>
        {lead && (
          <p
            className={`mt-4 max-w-measure text-base leading-relaxed ${
              centered ? 'mx-auto' : ''
            } ${inverse ? 'text-ink-inverse-secondary' : 'text-ink-secondary'}`}
          >
            {lead}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** Reading measure for long-form text (policies, help, service intros). */
export function ContentMeasure({ className = '', children, ...props }: DivProps) {
  return (
    <div className={`content-measure ${className}`} {...props}>
      {children}
    </div>
  )
}

interface CardGridProps extends DivProps {
  /** Columns at the widest breakpoint. Small screens are always one column. */
  columns?: 2 | 3 | 4
}

const COLUMNS: Record<NonNullable<CardGridProps['columns']>, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
}

export function CardGrid({ columns = 3, className = '', children, ...props }: CardGridProps) {
  return (
    <div className={`grid grid-cols-1 gap-4 ${COLUMNS[columns]} ${className}`} {...props}>
      {children}
    </div>
  )
}

interface ActionGroupProps extends DivProps {
  align?: 'start' | 'center'
}

/**
 * Consistent spacing and wrapping for a primary/secondary action pair. `min-w-0`
 * lets a long descriptive label wrap instead of forcing a horizontal scroll at
 * 320px.
 */
export function ActionGroup({ align = 'start', className = '', children, ...props }: ActionGroupProps) {
  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-3 ${
        align === 'center' ? 'justify-center' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
