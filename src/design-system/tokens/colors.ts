/**
 * Brand colors are the source of truth for the design system.
 * They are exposed to CSS via `--brand-*` custom properties in
 * `src/styles/globals.css` and mapped into Tailwind under `colors.brand.*`.
 *
 * Use these constants only in JS-side code (e.g. dynamic charts, framer
 * variants, programmatic SVG). For component styling, prefer Tailwind classes.
 */
export const brandColors = {
  mint: 'hsl(150 43% 97%)',
  sage: 'hsl(155 35% 88%)',
  green: 'hsl(155 100% 36%)',
  forest: 'hsl(155 85% 26%)',
  navyLight: 'hsl(214 55% 32%)',
  navy: 'hsl(214 80% 20%)',
  slate: 'hsl(214 48% 14%)',
  ink: 'hsl(214 60% 9%)',
} as const;

export type BrandColor = keyof typeof brandColors;
