import { siteConfig } from '@/config/site';

import { cn } from '@/lib/cn';

/**
 * Munasib brand mark — pure SVG, no image asset.
 *
 * A rounded bag/tag outline with a bold "M" inside, matching the approved
 * logo artwork exactly (same path data as `src/app/icon.svg`). Unlike the
 * old geometric "K" mark, this one uses FIXED brand hex colors rather than
 * the semantic primary/primary-foreground tokens — it's a literal approved
 * mark meant to look identical everywhere, the same reasoning that made the
 * old design's ember dot a fixed color regardless of theme. The mint card
 * fill is self-contained, so the mark reads correctly on both the light
 * header and the dark `surface-navy` footer band without a separate
 * "inverted" variant.
 *
 * Variants:
 *  - "mark":      bag/tag glyph only, sits beside the wordmark in tight layouts
 *  - "wordmark":  text-only treatment
 *  - "stack":     large mark + tagline (auth-side panels)
 */
type Variant = 'mark' | 'wordmark' | 'stack';

type BrandLogoProps = {
  variant?: Variant;
  size?: number;
  className?: string;
  /** Kept for API compatibility with the old image-based logo — unused. */
  priority?: boolean;
};

function Mark({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="36 18 498 536"
      role="img"
      aria-label={siteConfig.name}
      className={cn('shrink-0', className)}
    >
      <rect
        x="70"
        y="180"
        width="430"
        height="340"
        rx="72"
        fill="#F5FBF8"
        stroke="#00B86B"
        strokeWidth="28"
      />
      <path
        d="M178 192V156C178 91 226 52 285 52C344 52 392 91 392 156V192"
        fill="none"
        stroke="#00B86B"
        strokeWidth="28"
        strokeLinecap="round"
      />
      <path
        d="M145 455V286L285 408L425 286V455"
        fill="none"
        stroke="#0A2E5C"
        strokeWidth="48"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandLogo({ variant = 'mark', size = 36, className }: BrandLogoProps) {
  if (variant === 'wordmark') {
    return <Wordmark size={size} className={className} />;
  }

  if (variant === 'stack') {
    return (
      <div className={cn('flex flex-col items-center gap-3', className)}>
        <Mark size={size} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          {siteConfig.tagline}
        </span>
      </div>
    );
  }

  // mark
  return <Mark size={size} className={className} />;
}

function Wordmark({ size, className }: { size: number; className?: string }) {
  return (
    <span
      className={cn('font-sans font-extrabold tracking-tight text-foreground', className)}
      style={{ fontSize: size * 1.4, lineHeight: 1 }}
    >
      {siteConfig.name}
    </span>
  );
}

/**
 * Inline lockup: mark + wordmark side by side — the canonical brand
 * impression used in headers and footers.
 */
export function BrandLockup({
  size = 36,
  className,
  priority: _priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandLogo variant="mark" size={size} />
      <BrandLogo variant="wordmark" size={Math.round(size * 0.55)} />
    </span>
  );
}
