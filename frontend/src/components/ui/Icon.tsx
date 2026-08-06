import type { SVGProps } from 'react'

/**
 * Public icon system (Jira 10307).
 *
 * One coherent family: 24×24 viewBox, `currentColor`, 1.6 stroke, round caps and
 * joins, no fills. Drawn in this repository, so there is no third-party icon
 * licence to record and no icon package in the bundle — the paths are ordinary
 * JSX and tree-shake with the components that reference them.
 *
 * This replaces emoji as the *interface* icon system. Emoji rendered a different
 * shape, weight and colour on every platform, could not inherit `currentColor`,
 * and gave a service card an illustration that no two visitors saw alike.
 *
 * Accessibility contract:
 *   - default `aria-hidden="true"` and `focusable="false"` — an icon beside a
 *     visible label is decorative and must not be announced twice;
 *   - pass `title` to give a standalone icon an accessible name. Only do that
 *     when no visible text carries the same meaning.
 *
 * Status is never conveyed by an icon alone: `Notice` and `StatusBadge` always
 * render a written label next to the glyph.
 */

export type IconName =
  // Services
  | 'garment'
  | 'badge'
  | 'banner'
  | 'pull-up-banner'
  | 'business-card'
  | 'sticker'
  | 'signage'
  | 'artwork'
  // Audiences / use cases
  | 'community'
  | 'team'
  | 'event'
  | 'business'
  | 'school'
  | 'gift'
  // Interface
  | 'printer'
  | 'search'
  | 'package'
  | 'cart'
  | 'menu'
  | 'close'
  | 'check'
  | 'info'
  | 'warning'
  | 'error'
  | 'arrow-right'
  | 'external'

const PATHS: Record<IconName, JSX.Element> = {
  garment: (
    <path d="M8.5 3.5 5 5 3.5 9.5l3 1V20h11v-9.5l3-1L19 5l-3.5-1.5a3.5 3.5 0 0 1-7 0Z" />
  ),
  badge: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
  banner: (
    <>
      <path d="M4 4h16v11H4z" />
      <path d="M4 15v5M20 15v5" />
    </>
  ),
  'pull-up-banner': (
    <>
      <path d="M7 3h10v14H7z" />
      <path d="M12 17v3M8 20h8" />
    </>
  ),
  'business-card': (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 11h4M7 14h6" />
    </>
  ),
  sticker: (
    <>
      <path d="M14.5 3.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6l8-8v-3" />
      <path d="M13 20v-5a2 2 0 0 1 2-2h5" />
    </>
  ),
  signage: (
    <>
      <path d="M4 5h13l3 3-3 3H4z" />
      <path d="M9 11v9M6 20h6" />
    </>
  ),
  artwork: (
    <>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2a1.7 1.7 0 0 1 1.2-2.9H16a4.5 4.5 0 0 0 4.5-4.5C20.5 6.6 16.7 3.5 12 3.5Z" />
      <path d="M7.8 10.5h.01M11 7.5h.01M15.2 9h.01" />
    </>
  ),
  community: (
    <>
      <path d="M12 3 8 7v13h8V7l-4-4Z" />
      <path d="M12 3v4M10 7h4M4 20V11l4-3M20 20v-9l-4-3" />
    </>
  ),
  team: (
    <>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5.5H4.5V7a3 3 0 0 0 3 3M17 5.5h2.5V7a3 3 0 0 1-3 3" />
      <path d="M12 13v4M9 20h6" />
    </>
  ),
  event: (
    <>
      <path d="M4.5 19.5 9 8l7 7-11.5 4.5Z" />
      <path d="M14 4v2.5M18.5 5.5 17 7M20 10h-2.5" />
    </>
  ),
  business: (
    <>
      <path d="M4 20V6l8-3v17" />
      <path d="M12 10h8v10M4 20h16" />
      <path d="M7 9h2M7 13h2M16 14h1" />
    </>
  ),
  school: (
    <>
      <path d="m3 8.5 9-4 9 4-9 4-9-4Z" />
      <path d="M7 10.5V16c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-5.5M21 8.5V14" />
    </>
  ),
  gift: (
    <>
      <rect x="3.5" y="8.5" width="17" height="4" rx="1" />
      <path d="M5 12.5V20h14v-7.5M12 8.5V20" />
      <path d="M12 8.5S10.5 4 8.2 4a2.2 2.2 0 0 0 0 4.5h3.8Zm0 0S13.5 4 15.8 4a2.2 2.2 0 0 1 0 4.5H12Z" />
    </>
  ),
  printer: (
    <>
      <path d="M7 9V3.5h10V9" />
      <path d="M7 18H4.5A1.5 1.5 0 0 1 3 16.5V11a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5.5a1.5 1.5 0 0 1-1.5 1.5H17" />
      <path d="M7 14h10v6.5H7z" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4.5 4.5" />
    </>
  ),
  package: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  cart: (
    <>
      <path d="M16 11V7a4 4 0 0 0-8 0v4" />
      <path d="M5 9h14l1 12H4L5 9Z" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.75h.01" />
    </>
  ),
  warning: (
    <>
      <path d="M10.6 4.2 2.9 17.4A1.6 1.6 0 0 0 4.3 20h15.4a1.6 1.6 0 0 0 1.4-2.6L13.4 4.2a1.6 1.6 0 0 0-2.8 0Z" />
      <path d="M12 9.5v4M12 16.75h.01" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </>
  ),
  'arrow-right': <path d="M4 12h15m-6-6 6 6-6 6" />,
  external: (
    <>
      <path d="M13.5 4.5H19.5V10.5" />
      <path d="M19.5 4.5 11 13M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  ),
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'children'> {
  name: IconName
  /** Accessible name. Omit for a decorative icon that sits beside visible text. */
  title?: string
}

export function Icon({ name, title, className = 'h-5 w-5', ...props }: IconProps) {
  const decorative = title === undefined
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      focusable="false"
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
      {...props}
    >
      {!decorative && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  )
}

export const ICON_NAMES = Object.keys(PATHS) as IconName[]
