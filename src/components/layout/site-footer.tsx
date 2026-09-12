import Link from 'next/link';
import { Mail, Phone } from 'lucide-react';

import { footerNav } from '@/config/navigation';
import { siteConfig } from '@/config/site';

import { BrandLockup } from '@/components/brand/brand-logo';
import { NewsletterForm } from '@/components/layout/newsletter-form';

/**
 * Munasib footer — a deep navy anchor band. `surface-navy` repins the
 * semantic tokens, so text, borders, the brand lockup, and the newsletter
 * form all invert automatically without per-element overrides.
 */
export function SiteFooter() {
  return (
    <footer className="surface-navy">
      <div className="container py-16">
        {/* Brand block beside a self-sizing column grid, rather than one fixed
            12-column layout — the nav gained a full Categories column (an
            internal link to every category landing page, on every page of the
            site) and a hardcoded column count would have silently overflowed. */}
        <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:gap-16">
          <div className="flex max-w-md flex-col gap-4 lg:w-1/3 lg:shrink-0">
            <BrandLockup size={44} />
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
              {siteConfig.description}
            </p>
            <NewsletterForm />
          </div>

          <nav
            aria-label="Footer"
            className="grid flex-1 gap-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
          >
            {Object.entries(footerNav).map(([heading, items]) => (
              <div key={heading} className="flex flex-col gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                  {heading}
                </h4>
                <ul className="flex flex-col gap-2.5">
                  {items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="soft-divider my-10" />

        <div className="flex flex-col gap-4 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {siteConfig.name} — {siteConfig.tagline}. All rights
            reserved.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a
              href={`mailto:${siteConfig.contact.email}`}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Mail className="size-3.5" /> {siteConfig.contact.email}
            </a>
            <a
              href={`tel:${siteConfig.contact.phone.replace(/\s/g, '')}`}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Phone className="size-3.5" /> {siteConfig.contact.phone}
            </a>
            <span className="rounded-md border border-border px-2 py-1 text-[10px] uppercase tracking-[0.1em]">
              Cash on Delivery
            </span>
            <span className="rounded-md border border-border px-2 py-1 text-[10px] uppercase tracking-[0.1em]">
              Card Payments
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
