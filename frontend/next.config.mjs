// Allow self-signed certs from the local ASP.NET Core dev server.
// Has no effect in production since NODE_ENV will not be 'development'.
if (process.env.NODE_ENV === 'development') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

/**
 * Remote image hosts permitted by `next/image` (Jira 10304).
 *
 * Product catalogue images are served by the backend and reach the browser through
 * `NEXT_PUBLIC_API_BASE_URL` (in production the public domain, proxied by nginx). The single allowed
 * pattern is derived from that variable so the optimizer allow-list can never drift from the origin
 * the app actually uses, and it is narrowed to `/uploads/products/**` — the catalogue image folder.
 * Customer design artwork (`/uploads/designs/**`) is deliberately excluded.
 *
 * Deliberately NOT done: no `hostname: '**'` wildcard and no admin- or customer-supplied external
 * domain. A URL outside this pattern is detected by `isOptimizableImageUrl` in `lib/image-utils.ts`
 * and rendered with a plain `<img>`, so a missing/incorrect env var degrades quality rather than
 * breaking the page. Keep the two in sync if either changes.
 */
function catalogImagePatterns() {
  const patterns = []
  const base = process.env.NEXT_PUBLIC_API_BASE_URL

  if (base) {
    try {
      const url = new URL(base)
      patterns.push({
        protocol: url.protocol.replace(':', ''),
        hostname: url.hostname,
        ...(url.port ? { port: url.port } : {}),
        pathname: '/uploads/products/**',
      })
      patterns.push({
        protocol: url.protocol.replace(':', ''),
        hostname: url.hostname,
        ...(url.port ? { port: url.port } : {}),
        pathname: '/api/portfolio/items/**',
      })
    } catch {
      // Malformed value — fall through to the localhost dev pattern rather than failing the build.
    }
  }

  // Local development fallback (kept from the original config) for when the variable is unset.
  patterns.push({ protocol: 'https', hostname: 'localhost', pathname: '/uploads/products/**' })
  patterns.push({ protocol: 'https', hostname: 'localhost', pathname: '/api/portfolio/items/**' })

  return patterns
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: catalogImagePatterns(),
  },

  // Prevent browsers from caching Admin pages in bfcache.
  // Without this, clicking back after logout may briefly show a stale rendered page.
  // API responses are already no-store (set in the proxy route handler).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(self)',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ]
  },
}

export default nextConfig
