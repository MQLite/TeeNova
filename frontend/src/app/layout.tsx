import type { Metadata } from 'next'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { JsonLd } from '@/components/seo/JsonLd'
import {
  defaultDescription,
  defaultSocialDescription,
  defaultSocialImage,
  defaultTitle,
  openGraphSiteName,
  siteLanguage,
  siteLocale,
  titleTemplate,
  verificationTokens,
} from '@/lib/seo/identity'
import { metadataBase } from '@/lib/seo/metadata'
import { siteGraph } from '@/lib/seo/structured-data/organization'

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
 * `components/brand/BrandMark.tsx`. They are a browser-tab icon and are never
 * published as the business's logo (Jira 10300 A34 remains open).
 *
 * SEO note (Jira 10308): `metadataBase` comes from the validated public origin
 * (`lib/seo/site-url.ts`) and is `undefined` when production is misconfigured —
 * which suppresses canonicals and absolute Open Graph URLs rather than resolving
 * them against whatever host answered the request. The default social card is
 * `public/og-default.png`, referenced explicitly here and by every route through
 * `buildPageMetadata`. No verification token, social handle or analytics script
 * is emitted; the first two are blank until real values exist, and the third is
 * deliberately absent while the privacy policy is Draft.
 */

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: {
    default: defaultTitle,
    template: titleTemplate,
  },
  description: defaultDescription,
  applicationName: openGraphSiteName,
  // Referrer is trimmed to the origin on cross-origin navigations: outbound links (the Google Maps
  // search link on /contact) should not carry the full path a visitor was reading.
  referrer: 'strict-origin-when-cross-origin',
  // Safari otherwise auto-links number-like strings — order references and dimensions such as
  // "2000 x 800" — as telephone numbers.
  formatDetection: { telephone: false, address: false, email: false },
  openGraph: {
    title: defaultTitle,
    description: defaultSocialDescription,
    type: 'website',
    locale: siteLocale,
    siteName: openGraphSiteName,
    images: [defaultSocialImage],
  },
  twitter: {
    // No `site`/`creator` handle: none has been verified, and an unverified handle attributes the
    // page to an account that may belong to someone else.
    card: 'summary_large_image',
    title: defaultTitle,
    description: defaultSocialDescription,
  },
  robots: { index: true, follow: true },
  verification: verificationTokens(),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={siteLanguage}>
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
        {/* Site-level graph. Today this is the WebSite node only: the business identity and NAP
            approvals are open, so no Organization or LocalBusiness node is published. */}
        <JsonLd graph={siteGraph()} />
      </body>
    </html>
  )
}
