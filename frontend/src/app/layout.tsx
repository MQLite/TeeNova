import type { Metadata } from 'next'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { brandFullName } from '@/lib/site-brand'

/**
 * Root layout.
 *
 * Typography note (Jira 10307): there is no font import here on purpose. The
 * site uses a system-font stack declared once in `globals.css` as `--font-sans`.
 * The previous configuration named `figmaSans` / `figmaMono` in three files and
 * loaded neither — no font file, no `@font-face`, no `next/font` call existed
 * anywhere in the repository — so every visitor already rendered in the fallback
 * stack. Naming the real stack keeps fonts self-hosted by definition (no
 * third-party font CDN receiving visitor IPs), adds zero transfer bytes, and
 * removes the possibility of a font-swap layout shift.
 *
 * Icons come from the `app/icon.svg`, `app/apple-icon.png` and `app/favicon.ico`
 * file conventions; Next emits the `<link>` tags. Both raster assets are
 * documented placeholders derived from the mark already in the repository — see
 * `components/brand/BrandMark.tsx`.
 */

export const metadata: Metadata = {
  title: {
    default: 'Otahuhu Printing Shop | Custom Printing Auckland',
    template: '%s | Otahuhu Printing',
  },
  description:
    'Local Otahuhu print shop for T-shirt printing, badges, banners, business cards, stickers, signs and custom print jobs in Auckland.',
  // OpenGraph is intentionally image-less and URL-less: no confirmed OG image asset or canonical
  // domain exists yet (so no metadataBase). Add an image + metadataBase once those are confirmed.
  // Jira 10307 deliberately stops at the favicon/app-icon set and leaves the social card to 10308.
  openGraph: {
    title: 'Otahuhu Printing Shop | Custom Printing Auckland',
    description:
      'T-shirts, badges, banners, business cards, stickers, signs and custom print jobs from a local Otahuhu print shop.',
    type: 'website',
    locale: 'en_NZ',
    siteName: brandFullName,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* First focusable element in the document — a keyboard user can reach
            page content without stepping through the whole navigation. */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <div className="flex min-h-screen flex-col bg-canvas">
          <Header />
          <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <Footer />
        </div>
      </body>
    </html>
  )
}
