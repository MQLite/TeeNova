import { type ButtonHTMLAttributes, cloneElement, forwardRef, isValidElement } from 'react'

/**
 * Button system (Jira 10307).
 *
 * Presentation lives in `globals.css` (`.btn-*`) so a `<button>`, a Next `<Link>`
 * and a plain `<a>` can all look identical without this component having to be
 * in the middle. That matters for correctness of the element, not just style:
 * an action is a `<button>` and a navigation is a link, and forcing every CTA
 * through a React component was pushing pages toward the wrong one.
 *
 * Changes from the previous version:
 *   - `whitespace-nowrap` removed from the base. It caused long descriptive
 *     labels ("Request a quote for a print job") to overflow at 320px, which
 *     Jira 10306 had to work around per call site.
 *   - opacity-based hover replaced with real hover colours, so a hovered button
 *     no longer drops its own text contrast.
 *   - disabled state is a legible grey rather than `opacity-40`, which took the
 *     label to roughly 1.7:1.
 *   - loading reserves the spinner's width so the button does not resize.
 */

type Variant = 'black' | 'white' | 'glass' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  /**
   * Accessible name while `loading`. Defaults to keeping the existing children,
   * so a screen reader is never told the label disappeared.
   */
  loadingLabel?: string
  asChild?: boolean
}

const variantClasses: Record<Variant, string> = {
  black: 'btn-black',
  white: 'btn-white',
  glass: 'btn-glass',
  danger: 'btn-danger',
  ghost: 'btn-text',
}

const sizeClasses: Record<Size, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'black',
      size = 'md',
      loading,
      loadingLabel,
      className = '',
      children,
      disabled,
      asChild,
      ...props
    },
    ref,
  ) => {
    const classes = [variantClasses[variant], sizeClasses[size], className]
      .filter(Boolean)
      .join(' ')

    if (asChild && isValidElement(children)) {
      return cloneElement(children as React.ReactElement<{ className?: string }>, {
        className: `${classes} ${(children as React.ReactElement<{ className?: string }>).props.className ?? ''}`,
      })
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={classes}
        {...props}
      >
        {/* Reserved slot: the spinner replaces a same-width placeholder, so the
            button keeps its measured width across the loading transition. */}
        {loading !== undefined && (
          <span aria-hidden="true" className="inline-flex h-3.5 w-3.5 shrink-0 items-center">
            {loading && (
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 100 8v4a8 8 0 01-8-8z" />
              </svg>
            )}
          </span>
        )}
        {children}
        {loading && loadingLabel && <span className="sr-only">{loadingLabel}</span>}
      </button>
    )
  },
)
Button.displayName = 'Button'
