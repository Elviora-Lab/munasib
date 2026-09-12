import { ExitIntentNudge, PushPermissionNudge } from '@/components/layout/deferred-client';
import { MobileNav } from '@/components/layout/mobile-nav';
import { OfferTicker } from '@/components/layout/offer-ticker';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { WhatsAppWidget } from '@/components/layout/whatsapp-widget';
import { Survey } from '@/components/survey/lazy-survey';

import { AuthHydrator } from '@/features/auth/components/auth-hydrator';
import { CartDrawer } from '@/features/cart/components/cart-drawer';
import { CartHydrator } from '@/features/cart/components/cart-hydrator';
import { WishlistHydrator } from '@/features/wishlist/components/wishlist-hydrator';

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Strip + header share one sticky stack, so the strip stays pinned too. */}
      <div className="sticky top-0 z-40">
        <OfferTicker />
        <SiteHeader className="static" />
      </div>
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <CartDrawer />
      <MobileNav />
      <WhatsAppWidget />
      <ExitIntentNudge />
      <PushPermissionNudge />
      {/* Zero-party "why aren't you ordering" survey — dwell-triggered so it
          doesn't collide with the exit-intent nudge above. */}
      <Survey
        kind="exit_intent"
        question="why_not_buy"
        prompt="Anything holding you back from ordering today?"
        options={[
          'Price',
          'Shipping cost',
          'Not sure about the product',
          'Payment options',
          'Just browsing',
          'Something else',
        ]}
        trigger="dwell"
        skipPaths={['/checkout', '/account', '/review', '/admin']}
      />
      {/* Hydrators sync Redux with the server session/cart/wishlist on mount + invalidation. */}
      <AuthHydrator />
      <CartHydrator />
      <WishlistHydrator />
    </>
  );
}
