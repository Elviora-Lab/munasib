import type { Metadata, Viewport } from 'next';
import { Fredoka, Nunito } from 'next/font/google';

import { siteConfig } from '@/config/site';

import { AppProviders } from '@/providers/app-providers';

import { organizationJsonLd, websiteJsonLd } from '@/lib/seo/json-ld';
import { JsonLd } from '@/lib/seo/json-ld-component';
import { defaultMetadata } from '@/lib/seo/metadata';

import { CapiParamInit } from '@/components/analytics/capi-param-init';
import { Clarity } from '@/components/analytics/clarity';
import { ClickTracker } from '@/components/analytics/click-tracker';
import { GaIdentity } from '@/components/analytics/ga-identity';
import { GoogleAnalytics } from '@/components/analytics/google-analytics';
import { MetaIdentity } from '@/components/analytics/meta-identity';
import { MetaPixel } from '@/components/analytics/meta-pixel';
import { UtmCapture } from '@/components/analytics/utm-capture';

import '@/styles/globals.css';

// Warm/friendly brand type: rounded display face + a rounded-terminal body
// sans, replacing the old editorial Cormorant Garamond + Inter pairing. CSS
// variable names (--font-serif/--font-sans) and the Tailwind utilities that
// consume them (font-serif, font-sans, font-display) are kept as-is on
// purpose — only the physical font loaded into each slot changes, so the
// ~30+ files already using `font-serif`/`editorial-heading` don't need
// touching to pick up the new look.
const serif = Fredoka({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-serif',
  display: 'swap',
});

const sans = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = defaultMetadata;

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8FCFA' },
    { media: '(prefers-color-scheme: dark)', color: '#091320' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      // `en-PK`, matching the OG locale and the store's single market, rather
      // than a bare `en` — the regional variant is the more precise signal.
      lang={siteConfig.locale}
      suppressHydrationWarning
      className={`${serif.variable} ${sans.variable}`}
    >
      <head>
        {/* Warm the connection to the product-image CDN (the LCP image origin)
            and the free image-resize proxy, so the hero image isn't delayed by
            TLS/DNS setup — cuts the LCP "resource load delay". */}
        <link rel="preconnect" href="https://cdn.shopify.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://images.weserv.nl" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.shopify.com" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <MetaPixel />
        <Clarity />
        <CapiParamInit />
        <UtmCapture />
        <ClickTracker />
        <GoogleAnalytics />
        <AppProviders>
          <GaIdentity />
          <MetaIdentity />
          {children}
        </AppProviders>
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={websiteJsonLd()} />
      </body>
    </html>
  );
}
