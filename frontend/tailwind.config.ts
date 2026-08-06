import type { Config } from 'tailwindcss'

/**
 * Tailwind theme (Jira 10307).
 *
 * Every value here re-exports a CSS custom property declared in
 * `src/app/globals.css`. Tailwind is the ergonomic surface; `globals.css` is the
 * single source of truth. A palette decision is therefore a one-file change.
 *
 * The `figmaSans` / `figmaMono` families were removed: they were declared here,
 * in `globals.css` and in two component classes, but no font file, `@font-face`
 * rule or `next/font` import ever existed, so the browser silently fell through
 * to the system stack on every page. `--font-sans` names the stack actually
 * shipped.
 *
 * Colours are exposed as raw `var(...)` references, so Tailwind's `/opacity`
 * modifier does not apply to them. That is deliberate: opacity-derived colour
 * (`text-black/45`) is what produced the unmeasurable contrast this task had to
 * fix. Where a lighter ink is genuinely wanted, use the semantic token
 * (`text-ink-muted`) that has a measured ratio.
 */
const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: 'var(--canvas)',
          alt: 'var(--canvas-alt)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          sunken: 'var(--surface-sunken)',
          inverse: 'var(--surface-inverse)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          secondary: 'var(--ink-secondary)',
          muted: 'var(--ink-muted)',
          inverse: 'var(--ink-inverse)',
          'inverse-secondary': 'var(--ink-inverse-secondary)',
          'inverse-muted': 'var(--ink-inverse-muted)',
          'on-accent': 'var(--ink-on-accent)',
          'on-accent-muted': 'var(--ink-on-accent-muted)',
        },
        line: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
          control: 'var(--border-control)',
          inverse: 'var(--border-inverse)',
        },
        action: {
          DEFAULT: 'var(--action)',
          hover: 'var(--action-hover)',
          ink: 'var(--action-ink)',
          secondary: 'var(--action-secondary)',
          danger: 'var(--action-danger)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          soft: 'var(--accent-soft)',
        },
        success: {
          DEFAULT: 'var(--success-ink)',
          surface: 'var(--success-surface)',
          border: 'var(--success-border)',
        },
        warning: {
          DEFAULT: 'var(--warning-ink)',
          surface: 'var(--warning-surface)',
          border: 'var(--warning-border)',
        },
        danger: {
          DEFAULT: 'var(--danger-ink)',
          surface: 'var(--danger-surface)',
          border: 'var(--danger-border)',
        },
        info: {
          DEFAULT: 'var(--info-ink)',
          surface: 'var(--info-surface)',
          border: 'var(--info-border)',
        },
        // Retained: `glass` and `status` are referenced by existing Admin data
        // badges, which are out of this task's scope.
        glass: {
          dark: 'rgba(0,0,0,0.08)',
          light: 'rgba(255,255,255,0.16)',
        },
        status: {
          amber: '#f59e0b',
          blue: '#3b82f6',
          purple: '#8b5cf6',
          sky: '#0ea5e9',
          green: '#22c55e',
          red: '#ef4444',
        },
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      fontWeight: {
        // Real weights only — a system face cannot render 320/450/480/540, so
        // the previous stops were either rounded or synthesised.
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      borderRadius: {
        none: '0',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-xl)',
        pill: 'var(--radius-pill)',
        full: '9999px',
        circle: '50%',
      },
      maxWidth: {
        measure: 'var(--measure-content)',
        'measure-wide': 'var(--measure-wide)',
        page: 'var(--measure-page)',
      },
      spacing: {
        gutter: 'var(--space-gutter)',
        'section-y': 'var(--space-section-y)',
        'section-y-lg': 'var(--space-section-y-lg)',
        'sticky-clearance': 'var(--space-sticky-clearance)',
      },
      lineHeight: {
        display: 'var(--text-display-line)',
        heading: 'var(--text-h1-line)',
        tight: 'var(--line-tight)',
        body: 'var(--line-body)',
        relaxed: 'var(--line-relaxed)',
        sub: 'var(--line-tight)',
        feature: 'var(--line-relaxed)',
      },
      letterSpacing: {
        'display-xl': 'var(--text-display-track)',
        'display-lg': 'var(--text-h1-track)',
        'display-md': 'var(--text-h2-track)',
        body: 'var(--track-body)',
        'body-tight': 'var(--track-body)',
        'mono-label': 'var(--track-mono)',
        'mono-sm': 'var(--track-mono)',
      },
      boxShadow: {
        card: 'var(--shadow-subtle)',
        elevated: 'var(--shadow-hover)',
        dialog: 'var(--shadow-dialog)',
        sticky: 'var(--shadow-sticky)',
      },
      transitionTimingFunction: {
        brand: 'var(--ease)',
      },
      transitionDuration: {
        fast: 'var(--motion-fast)',
        brand: 'var(--motion)',
        slow: 'var(--motion-slow)',
      },
      backgroundImage: {
        'accent-gradient': 'var(--accent-gradient)',
      },
    },
  },
  plugins: [],
}

export default config
