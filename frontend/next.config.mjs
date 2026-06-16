// Allow self-signed certs from the local ASP.NET Core dev server.
// Has no effect in production since NODE_ENV will not be 'development'.
if (process.env.NODE_ENV === 'development') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'localhost',
      },
    ],
  },

  // Prevent browsers from caching Admin pages in bfcache.
  // Without this, clicking back after logout may briefly show a stale rendered page.
  // API responses are already no-store (set in the proxy route handler).
  async headers() {
    return [
      {
        source: '/admin/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ]
  },
}

export default nextConfig
