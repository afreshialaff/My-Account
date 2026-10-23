import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The NestJS API runs in-process via pages/api/v1/[...path].ts unless API_URL points elsewhere.
  serverExternalPackages: ['@aos/api', '@nestjs/core', '@nestjs/common', '@nestjs/platform-express', '@nestjs/swagger', '@nestjs/throttler', 'pg', 'bcryptjs'],
  outputFileTracingRoot: path.join(here, '../..'),
  outputFileTracingIncludes: { '/api/v1/[...path]': ['../api/dist/**/*.js'] },
  async rewrites() {
    // Same-origin proxy keeps the httpOnly session cookie working with a separately hosted API.
    return process.env.API_URL ? [{ source: '/api/v1/:path*', destination: `${process.env.API_URL}/api/v1/:path*` }] : []
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
