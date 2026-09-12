import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/app/**/*.{ts,tsx,mdx}',
    './src/components/**/*.{ts,tsx}',
    './src/features/**/*.{ts,tsx}',
    './src/design-system/**/*.{ts,tsx}',
    './src/shared/**/*.{ts,tsx}',
    './src/providers/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem',
        xl: '3rem',
        '2xl': '4rem',
      },
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1440px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        // Brand tokens — Munasib navy + green palette
        brand: {
          cloud: 'hsl(var(--brand-cloud) / <alpha-value>)',
          sand: 'hsl(var(--brand-sand) / <alpha-value>)',
          stone: 'hsl(var(--brand-stone) / <alpha-value>)',
          mist: 'hsl(var(--brand-mist) / <alpha-value>)',
          teal: 'hsl(var(--brand-teal) / <alpha-value>)',
          ember: 'hsl(var(--brand-ember) / <alpha-value>)',
          amber: 'hsl(var(--brand-amber) / <alpha-value>)',
          steel: 'hsl(var(--brand-steel) / <alpha-value>)',
          navy: 'hsl(var(--brand-navy) / <alpha-value>)',
          slate: 'hsl(var(--brand-slate) / <alpha-value>)',
          ink: 'hsl(var(--brand-ink) / <alpha-value>)',
        },
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Fredoka', 'ui-rounded', 'sans-serif'],
        sans: ['var(--font-sans)', 'Nunito', 'system-ui', 'sans-serif'],
        display: ['var(--font-serif)', 'Fredoka', 'ui-rounded', 'sans-serif'],
      },
      fontSize: {
        'display-2xl': [
          'clamp(3.5rem, 7vw, 6rem)',
          { lineHeight: '1.05', letterSpacing: '-0.02em' },
        ],
        'display-xl': [
          'clamp(2.75rem, 5vw, 4.5rem)',
          { lineHeight: '1.08', letterSpacing: '-0.02em' },
        ],
        'display-lg': [
          'clamp(2.25rem, 4vw, 3.5rem)',
          { lineHeight: '1.1', letterSpacing: '-0.015em' },
        ],
        'display-md': [
          'clamp(1.875rem, 3vw, 2.5rem)',
          { lineHeight: '1.15', letterSpacing: '-0.01em' },
        ],
        'display-sm': ['clamp(1.5rem, 2vw, 2rem)', { lineHeight: '1.2' }],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        soft: '0 2px 12px -2px rgb(9 24 43 / 0.06)',
        card: '0 4px 20px -4px rgb(9 24 43 / 0.08)',
        elevated: '0 10px 40px -10px rgb(9 24 43 / 0.16)',
        pop: '0 16px 44px -16px hsl(var(--brand-navy) / 0.35)',
        // Soft teal halo — for hover states and featured surfaces.
        glow: '0 0 44px -10px hsl(var(--brand-teal) / 0.35)',
      },
      spacing: {
        '4.5': '1.125rem',
        '18': '4.5rem',
        '22': '5.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      transitionTimingFunction: {
        // Swift, settled ease for micro-interactions (out-quart-ish).
        swift: 'cubic-bezier(0.22, 1, 0.36, 1)',
        snappy: 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        // Micro-interactions: a quick settle-in pop (badges, hearts, counts)
        // and a gentle attention wiggle (cart icon on add).
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.6)' },
          '60%': { transform: 'scale(1.12)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-8deg)' },
          '75%': { transform: 'rotate(8deg)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.4s ease-out',
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
        shimmer: 'shimmer 1.6s infinite',
        marquee: 'marquee 30s linear infinite',
        'pop-in': 'pop-in 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        wiggle: 'wiggle 0.4s ease-in-out',
      },
      backgroundImage: {
        // CTA wash: brand green → deep green.
        'gradient-ember':
          'linear-gradient(135deg, hsl(var(--brand-ember)) 0%, hsl(155 85% 26%) 100%)',
        // Light warm band (hero, feature strips).
        'gradient-cloud':
          'linear-gradient(180deg, hsl(var(--brand-sand)) 0%, hsl(var(--brand-cloud)) 100%)',
        // Pale teal wash for informational bands.
        'gradient-mist':
          'linear-gradient(135deg, hsl(var(--brand-mist)) 0%, hsl(var(--brand-cloud)) 100%)',
        // Deep navy band (footer, dark strips).
        'gradient-navy':
          'linear-gradient(160deg, hsl(var(--brand-navy)) 0%, hsl(var(--brand-ink)) 100%)',
      },
    },
  },
  plugins: [animate],
};

export default config;
