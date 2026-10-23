/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL || 'http://localhost:4000'

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The browser talks to the API through this same origin, so the httpOnly session cookie just works.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` }]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
