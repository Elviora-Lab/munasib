import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Enforcing Content-Security-Policy. Sources reflect what the app actually
// loads: GA/GTM, Meta Pixel, Microsoft Clarity, Sentry, and the image CDNs
// (Shopify/Supabase/Unsplash/Cloudinary/weserv via img-src https:).
//
// 'unsafe-inline' for scripts remains: Next's inline hydration payload and the
// GTM/Pixel/Clarity bootstrap snippets are inline. Removing it requires
// nonce-plumbing through middleware and every analytics component — tracked as
// a follow-up. 'unsafe-eval' is dev-only (React Refresh needs it); production
// blocks eval entirely.
const isDevBuild = process.env.NODE_ENV !== 'production';
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self' https://www.facebook.com",
  "frame-ancestors 'none'",
  `script-src 'self' 'unsafe-inline'${isDevBuild ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com https://*.google-analytics.com https://connect.facebook.net https://www.facebook.com https://www.clarity.ms https://*.clarity.ms https://www.gstatic.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://connect.facebook.net https://*.facebook.com https://capig.datah04.com https://*.supabase.co https://*.sentry.io https://*.clarity.ms https://c.bing.com https://*.googleapis.com https://fcmregistrations.googleapis.com https://firebaseinstallations.googleapis.com https://fcm.googleapis.com",
  "worker-src 'self' blob:",
  'frame-src https://www.facebook.com https://td.doubleclick.net',
  "manifest-src 'self'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  images: {
    // Resize through each source CDN (Shopify/Unsplash/Cloudinary) via a custom
    // loader instead of Vercel's metered Image Optimization — the plan's 5K/mo
    // transformation quota was being exhausted, which stopped images rendering.
    // With a loaderFile the optimizer is bypassed entirely (zero transforms);
    // deviceSizes/imageSizes below still drive the responsive srcSet widths.
    loaderFile: './src/lib/image-loader.ts',
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'cdn.elviora.com' },
      // Imported catalog (data/products.json) serves images from Shopify's CDN.
      { protocol: 'https', hostname: 'cdn.shopify.com' },
      // Admin uploads land in Supabase Storage; free-plan resizing proxies
      // through weserv (see src/lib/image-loader.ts).
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.weserv.nl' },
      // Deliberately NO https://** wildcard: an arbitrary-host allowance lets
      // attacker-controlled images render under the site's origin. Admins must
      // upload (or use a whitelisted CDN) rather than paste arbitrary URLs.
    ],
    // Trimmed width ladders (was 9 device + 8 image sizes) — fewer widths means
    // fewer transformations per image, with negligible impact on how closely a
    // rendered image matches its display size.
    deviceSizes: [640, 828, 1080, 1440, 1920],
    imageSizes: [64, 128, 256, 384],
  },

  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion', '@radix-ui/react-icons'],
    // Vercel builds prerender 500+ PDPs. Each SSG worker gets its own Prisma
    // client — too many workers × default pool size hits Supabase EMAXCONN
    // (max ~200 clients). Keep concurrency low and prefer fewer fat workers.
    staticGenerationMaxConcurrency: 1,
    staticGenerationMinPagesPerWorker: 200,
    staticGenerationRetryCount: 2,
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Force HTTPS for two years incl. subdomains (HSTS preload-eligible).
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'Content-Security-Policy', value: CSP },
        ],
      },
    ];
  },
};

// Only wrap with Sentry when a DSN is configured (production/preview). The
// Sentry build plugin injects client instrumentation that, in local dev with
// no DSN, triggers Next's "missing bootstrap script" invariant — and there's
// nothing to report to anyway. So local dev runs the plain config.
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      telemetry: false,
    })
  : nextConfig;
