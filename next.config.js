/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_COSMIC_BUCKET_SLUG: process.env.COSMIC_BUCKET_SLUG,
  },
  images: {
    domains: [
      'cdn.cosmicjs.com',
      'imgix.cosmicjs.com',
      'images.unsplash.com'
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "*.vercel.app", "www.cosmicmailer.com", "cosmicmailer.com"],
    },
  },
  // Add security headers
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig