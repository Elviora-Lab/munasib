import { ImageResponse } from 'next/og';

import { siteConfig } from '@/config/site';

// Default social-share card for the whole site. Pages that set their own
// `openGraph.images` (e.g. product pages use the product photo) override this;
// everything else inherits this branded card. Replaces the old /og.jpg that
// never existed. Regenerated statically at build — no binary asset to maintain.

export const alt = `${siteConfig.name} — ${siteConfig.positioning}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BG = '#0A2E5C';
const GREEN = '#00B86B';
const MINT = '#F5FBF8';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: BG,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '92%',
          height: '86%',
          border: `2px solid ${GREEN}`,
        }}
      >
        <div
          style={{
            fontSize: 118,
            letterSpacing: 14,
            color: GREEN,
            fontWeight: 600,
            display: 'flex',
          }}
        >
          {siteConfig.name.toUpperCase()}
        </div>
        <div style={{ width: 80, height: 1, background: GREEN, margin: '28px 0' }} />
        <div
          style={{
            fontSize: 30,
            letterSpacing: 8,
            color: MINT,
            display: 'flex',
          }}
        >
          {siteConfig.positioning.toUpperCase()}
        </div>
      </div>
    </div>,
    { ...size },
  );
}
