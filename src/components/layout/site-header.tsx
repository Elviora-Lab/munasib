'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, Search } from 'lucide-react';

import { primaryNav, quickLinks } from '@/config/navigation';
import { siteConfig } from '@/config/site';

import { useAppDispatch } from '@/store/hooks';
import { openMobileNav } from '@/store/slices/ui-slice';

import { cn } from '@/lib/cn';

import { BrandLockup, BrandLogo } from '@/components/brand/brand-logo';
import { NavItem } from '@/components/layout/nav-item';

import { CartDrawerTrigger } from '@/features/cart/components/cart-drawer';

/**
 * Munasib header — search-first, two rows on desktop.
 *
 * Household shopping is utility-driven: people arrive knowing the thing they
 * need ("spice rack", "drain brush"), so the search field gets the header's
 * prime real estate. Row two is the category nav (the existing mega-menu
 * NavItem). On mobile it collapses to hamburger + logo + search + cart.
 */
export function SiteHeader({ className }: { className?: string }) {
  const dispatch = useAppDispatch();
  const router = useRouter();

  // ⌘K / Ctrl+K jumps to search — the field advertises it, so honor it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        router.push('/search');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full border-b border-border/60',
        'surface-glass',
        className,
      )}
    >
      <div className="container flex h-16 items-center gap-3">
        <button
          type="button"
          onClick={() => dispatch(openMobileNav())}
          className="grid size-10 place-items-center rounded-full transition-colors hover:bg-muted active:scale-95 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>

        <Link
          href="/"
          aria-label={`${siteConfig.name} home`}
          className="inline-flex shrink-0 items-center"
        >
          {/* Mark only on mobile (save space next to the icon row);
              full mark + wordmark on lg+ where there's room. */}
          <span className="lg:hidden">
            <BrandLogo variant="mark" size={36} />
          </span>
          <span className="hidden lg:inline">
            <BrandLockup size={36} />
          </span>
        </Link>

        {/* Search field — the header's centerpiece. A styled trigger that
            routes to the working /search page (the old openSearch dispatch
            went to state nothing rendered). */}
        <button
          type="button"
          onClick={() => router.push('/search')}
          data-track="cta"
          data-track-label="header-search"
          className={cn(
            'group mx-auto hidden h-11 w-full max-w-xl items-center gap-2.5 rounded-full md:flex',
            'border border-input bg-background/80 px-4 text-left',
            'transition-all duration-300 ease-swift hover:border-accent/60 hover:shadow-soft',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
          aria-label="Search products"
        >
          <Search className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" />
          <span className="flex-1 truncate text-sm text-muted-foreground">
            Search kitchen tools, storage, cleaning…
          </span>
          <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:inline">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0">
          <Link
            href="/search"
            className="grid size-10 place-items-center rounded-full transition-colors hover:bg-muted active:scale-95 md:hidden"
            aria-label="Search"
          >
            <Search className="size-5" />
          </Link>
          <CartDrawerTrigger />
        </div>
      </div>

      {/* Category nav row (desktop). Categories are direct one-click links — no
          dropdown. The row scrolls horizontally (scrollbar hidden) as a
          graceful fallback on narrow laptops instead of wrapping/breaking. */}
      <nav className="hidden border-t border-border/40 lg:block">
        <div className="container flex h-11 items-center gap-x-5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {primaryNav.map((item) => (
            <NavItem key={item.href} item={item} />
          ))}

          {/* Promotional shortcuts + full catalog, pinned right. */}
          <div className="ml-auto flex shrink-0 items-center gap-x-4 pl-4">
            {quickLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-track="nav"
                data-track-label={item.label}
                className="whitespace-nowrap text-xs uppercase tracking-[0.12em] text-foreground/70 transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/products"
              className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.12em] text-brand-ember transition-colors hover:text-brand-ember/80"
              data-track="nav"
              data-track-label="all-products"
            >
              All Products
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}
