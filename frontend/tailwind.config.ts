import type { Config } from 'tailwindcss'

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
        // Figma-inspired binary palette — interface is strictly black & white
        glass: {
          dark:  'rgba(0,0,0,0.08)',
          light: 'rgba(255,255,255,0.16)',
        },
        // Status colors (used only in data badges, never in chrome)
        status: {
          amber:  '#f59e0b',
          blue:   '#3b82f6',
          purple: '#8b5cf6',
          sky:    '#0ea5e9',
          green:  '#22c55e',
          red:    '#ef4444',
        },
      },
      fontFamily: {
        sans: [
          'figmaSans',
          'figmaSans Fallback',
          'SF Pro Display',
          'system-ui',
          'helvetica',
          'sans-serif',
        ],
        mono: [
          'figmaMono',
          'figmaMono Fallback',
          'SF Mono',
          'Menlo',
          'monospace',
        ],
      },
      fontWeight: {
        // Variable font weight stops — the granular control IS the design
        'thin':       '320',
        'extralight': '330',
        'light':      '340',
        'normal':     '400',
        'medium':     '450',
        'semibold':   '480',
        'bold':       '540',
        'extrabold':  '700',
      },
      borderRadius: {
        'none':    '0',
        'sm':      '2px',
        'DEFAULT': '4px',
        'md':      '6px',
        'lg':      '8px',
        'pill':    '50px',
        'full':    '9999px',
        'circle':  '50%',
      },
      letterSpacing: {
        'display-xl':  '-1.72px',
        'display-lg':  '-0.96px',
        'display-md':  '-0.26px',
        'body':        '-0.14px',
        'body-tight':  '-0.10px',
        'mono-label':  '0.54px',
        'mono-sm':     '0.60px',
      },
      lineHeight: {
        'display': '1.00',
        'heading': '1.10',
        'sub':     '1.35',
        'feature': '1.45',
        'body':    '1.40',
        'tight':   '1.30',
      },
      boxShadow: {
        'card':    '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)',
        'elevated':'0 4px 12px 0 rgba(0,0,0,0.10)',
      },
    },
  },
  plugins: [],
}

export default config
