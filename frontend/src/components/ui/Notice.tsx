import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/**
 * Notices, empty states and status badges (Jira 10307).
 *
 * Every variant pairs a tint with an icon *and* a written label, so meaning is
 * never carried by colour alone. The icon itself is always `aria-hidden`: the
 * text beside it is the accessible content.
 */

export type NoticeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const TONE_CLASS: Record<NoticeTone, string> = {
  neutral: 'notice',
  info: 'notice notice-info',
  success: 'notice notice-success',
  warning: 'notice notice-warning',
  danger: 'notice notice-danger',
}

const TONE_ICON: Record<NoticeTone, IconName> = {
  neutral: 'info',
  info: 'info',
  success: 'check',
  warning: 'warning',
  danger: 'error',
}

interface NoticeProps {
  tone?: NoticeTone
  /** Optional short heading. The body is required — a notice always says something. */
  title?: string
  children: ReactNode
  /**
   * ARIA role. `alert` for a problem the customer must see now, `status` for a
   * passive update. Omit for static page furniture — a permanently rendered
   * live region is announced on every navigation.
   */
  role?: 'alert' | 'status' | 'note'
  className?: string
}

export function Notice({ tone = 'neutral', title, children, role, className = '' }: NoticeProps) {
  return (
    <div
      role={role}
      aria-live={role === 'status' ? 'polite' : undefined}
      className={`${TONE_CLASS[tone]} ${className}`}
    >
      <Icon name={TONE_ICON[tone]} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? 'mt-1' : ''}>{children}</div>
      </div>
    </div>
  )
}

interface EmptyStateProps {
  /** Decorative illustration. Chosen from the shared icon family, never emoji. */
  icon?: IconName
  title: string
  body?: ReactNode
  /** Buttons or links. Rendered as a wrapped, centred action row. */
  actions?: ReactNode
  /**
   * `empty` = nothing to show yet. `disabled` = the feature is switched off.
   * `error` = we failed to load. The three are distinguished visually and in
   * copy because they call for different next steps.
   */
  variant?: 'empty' | 'disabled' | 'error'
  /** Heading level, so an empty state does not disturb the page heading order. */
  as?: 'h2' | 'h3'
  className?: string
}

const VARIANT_CLASS: Record<NonNullable<EmptyStateProps['variant']>, string> = {
  empty: 'card-outline',
  disabled: 'card-quiet',
  error: 'card-quiet border-danger-border bg-danger-surface',
}

const VARIANT_ICON: Record<NonNullable<EmptyStateProps['variant']>, IconName> = {
  empty: 'package',
  disabled: 'info',
  error: 'warning',
}

export function EmptyState({
  icon,
  title,
  body,
  actions,
  variant = 'empty',
  as: Heading = 'h3',
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-14 text-center sm:py-16 ${VARIANT_CLASS[variant]} ${className}`}
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full ${
          variant === 'error' ? 'text-danger' : 'bg-surface-sunken text-ink-muted'
        }`}
      >
        <Icon name={icon ?? VARIANT_ICON[variant]} className="h-5 w-5" />
      </span>
      <Heading className="mt-4 display-sub">{title}</Heading>
      {body && <p className="mt-2 max-w-measure text-sm leading-relaxed text-ink-muted">{body}</p>}
      {actions && (
        <div className="mt-6 flex min-w-0 flex-wrap justify-center gap-3">{actions}</div>
      )}
    </div>
  )
}

interface StatusBadgeProps {
  tone?: NoticeTone
  /** Always visible. A status is never an icon on its own. */
  children: ReactNode
  icon?: IconName
  className?: string
}

const BADGE_CLASS: Record<NoticeTone, string> = {
  neutral: 'border-line-strong bg-surface-sunken text-ink-secondary',
  info: 'border-info-border bg-info-surface text-info',
  success: 'border-success-border bg-success-surface text-success',
  warning: 'border-warning-border bg-warning-surface text-warning',
  danger: 'border-danger-border bg-danger-surface text-danger',
}

export function StatusBadge({ tone = 'neutral', children, icon, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`mono-sm inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 ${BADGE_CLASS[tone]} ${className}`}
    >
      <Icon name={icon ?? TONE_ICON[tone]} className="h-3.5 w-3.5 shrink-0" />
      {children}
    </span>
  )
}
