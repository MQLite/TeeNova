import type { Metadata } from 'next'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

export const metadata: Metadata = {
  title: {
    default: 'Otahuhu Printing Shop | Custom Printing Auckland',
    template: '%s | Otahuhu Printing',
  },
  description:
    'Local Otahuhu print shop for T-shirt printing, badges, banners, business cards, stickers, signs and custom print jobs in Auckland.',
  // OpenGraph is intentionally image-less and URL-less: no confirmed OG image asset or canonical
  // domain exists yet (so no metadataBase). Add an image + metadataBase once those are confirmed.
  openGraph: {
    title: 'Otahuhu Printing Shop | Custom Printing Auckland',
    description:
      'T-shirts, badges, banners, business cards, stickers, signs and custom print jobs from a local Otahuhu print shop.',
    type: 'website',
    locale: 'en_NZ',
    siteName: 'Otahuhu Printing Shop',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col bg-white">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  )
}
