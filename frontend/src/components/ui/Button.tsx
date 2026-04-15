import { type ButtonHTMLAttributes, cloneElement, forwardRef, isValidElement } from 'react'

type Variant = 'black' | 'white' | 'glass' | 'danger' | 'ghost'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  asChild?: boolean
}

const base = 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[50px] cursor-pointer transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed'

const variantClasses: Record<Variant, string> = {
  black: [
    base,
    'bg-black text-white shadow-sm',
    'hover:opacity-[0.82] active:opacity-70',
    'focus-visible:outline-dashed focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2',
  ].join(' '),
  white: [
    base,
    'border border-black/10 bg-white text-black shadow-sm',
    'hover:opacity-[0.88] active:opacity-75',
    'focus-visible:outline-dashed focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2',
  ].join(' '),
  glass: [
    base,
    'bg-black/[0.08] text-black',
    'hover:bg-black/[0.13] active:bg-black/[0.18]',
    'focus-visible:outline-dashed focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2',
  ].join(' '),
  danger: [
    base,
    'bg-red-600 text-white shadow-sm',
    'hover:opacity-80 active:opacity-70',
    'focus-visible:outline-dashed focus-visible:outline-2 focus-visible:outline-red-600 focus-visible:outline-offset-2',
  ].join(' '),
  ghost: [
    base,
    'border border-transparent bg-transparent text-black/55',
    'hover:border-black/10 hover:bg-black/[0.04] hover:text-black active:bg-black/[0.08]',
    'focus-visible:outline-dashed focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2',
  ].join(' '),
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-[14px] py-[6px] text-sm tracking-[-0.14px]',
  md: 'px-[22px] py-[10px] text-base tracking-[-0.14px]',
  lg: 'px-[28px] py-[12px] text-base tracking-[-0.14px]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'black', size = 'md', loading, className = '', children, disabled, asChild, ...props }, ref) => {
    const classes = `${variantClasses[variant]} ${sizeClasses[size]} ${className}`

    if (asChild && isValidElement(children)) {
      return cloneElement(children as React.ReactElement<{ className?: string }>, {
        className: `${classes} ${(children as React.ReactElement<{ className?: string }>).props.className ?? ''}`,
      })
    }

    return (
      <button ref={ref} disabled={disabled || loading} className={classes} {...props}>
        {loading && (
          <svg className="h-3.5 w-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 100 8v4a8 8 0 01-8-8z" />
          </svg>
        )}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'
