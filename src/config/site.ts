import { publicEnv } from './env';

/**
 * The canonical origin for this storefront — `https://munasib.pk` in
 * production.
 *
 * EVERY absolute URL the site emits (canonicals, Open Graph, JSON-LD `url` and
 * `@id`, sitemap entries, robots host, product feeds) must be derived from this
 * one constant. A single hardcoded absolute URL anywhere in the codebase is
 * how a domain mix-up gets shipped, so hardcoding is banned by convention and
 * `absoluteUrl()` in `@/lib/seo/metadata` is the only sanctioned way to build one.
 *
 * The value comes from `NEXT_PUBLIC_SITE_URL`, which `config/env.ts` refuses to
 * leave at its localhost default in a production build.
 */
export const SITE_URL = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');

export const siteConfig = {
  name: publicEnv.NEXT_PUBLIC_SITE_NAME,
  /**
   * Disambiguating form. Used in `alternateName` and, sparingly, in page
   * titles where the market matters — never as a replacement for the visible
   * brand, which stays "Munasib".
   */
  alternateName: 'Munasib Pakistan',
  url: SITE_URL,
  /**
   * VISIBLE slogan — brand lockup, mobile drawer, footer copyright, shipping
   * label. Short enough to sit under a logo without wrapping.
   *
   * Deliberately NOT the same string as {@link positioning} below. The two do
   * different jobs and were briefly collapsed into one, which put a 35-character
   * SEO phrase under the logo mark. A slogan is read by a person in half a
   * second; a positioning line is read by a crawler deciding what this domain
   * sells. Change this one for brand reasons, that one for search reasons.
   */
  tagline: 'Smart Living Essentials',
  /**
   * SEO/entity positioning — the metadata fallback title and the Open Graph
   * card. Deliberately NOT kitchen-only: the catalog spans kitchen, home,
   * living, beauty, baby, gadgets, wardrobe, decor and mobile accessories, and
   * the architecture has to survive the next category too.
   */
  positioning: 'Home, Kitchen & Everyday Essentials',
  /**
   * Entity description — the sentence we want Google to associate with this
   * domain. Leads with breadth (home + kitchen + everyday), names the market
   * (Pakistan), and states the commercial hook (cash on delivery).
   */
  description:
    'Munasib is a Pakistani online store for practical home, kitchen and everyday essentials — organizers, gadgets, baby, beauty and mobile accessories, with cash on delivery nationwide.',
  /** Short form for meta descriptions that already carry page-specific copy. */
  shortDescription:
    'Practical home, kitchen and everyday essentials, delivered across Pakistan with cash on delivery.',
  meaning:
    'Munasib — Urdu for "fitting, suitable" — useful things for everyday life, chosen for build quality and priced for daily use.',
  locale: 'en-PK',
  defaultCurrency: 'PKR',
  /**
   * `sameAs` is an ENTITY CLAIM, not a link list: it tells Google "this domain
   * and these profiles are the same business". Only accounts we actually own
   * belong here. Env-overridable so a profile can be added or corrected without
   * a code change, and any unset value is omitted rather than guessed.
   *
   * No Munasib profiles are set yet — leave these env-driven and unset until
   * real Instagram/Facebook accounts exist. Do NOT reuse the old Kitchenly
   * handles as a fallback; they belong to a different brand.
   */
  social: {
    instagram: publicEnv.NEXT_PUBLIC_SOCIAL_INSTAGRAM,
    facebook: publicEnv.NEXT_PUBLIC_SOCIAL_FACEBOOK,
    youtube: publicEnv.NEXT_PUBLIC_SOCIAL_YOUTUBE,
    tiktok: publicEnv.NEXT_PUBLIC_SOCIAL_TIKTOK,
  },
  contact: {
    email: 'munasibpk12@gmail.com',
    phone: '+92 343 0803769',
  },
  /**
   * Where the business operates from — the address published in Organization
   * schema. City-level only: a street address in structured data is a claim
   * that has to hold up (Google cross-references it against Maps/GMB listings),
   * and Munasib has no walk-in location to back one.
   *
   * Karachi/Sindh matches the dispatch origin the shipping rate card is built
   * around (`src/lib/shipping.ts`).
   */
  business: {
    city: 'Karachi',
    region: 'Sindh',
    country: 'PK',
    countryName: 'Pakistan',
  },
  /**
   * Return / sender address printed on every shipping label — an operational
   * value, NOT an entity signal (schema uses `business` above).
   *
   * NOTE: this still reads Islamabad while the dispatch origin is Karachi.
   * Replace with the real Karachi pickup address; it is printed on labels, so
   * it must be the address the courier actually collects from.
   */
  shippingFrom: {
    name: 'Munasib HQ',
    addressLine1: '12 Khayaban-e-Iqbal, F-7',
    addressLine2: '',
    city: 'Islamabad',
    area: 'F-7',
    postalCode: '44000',
    country: 'PK',
    phone: '+92 (51) 111 0001',
  },
  /**
   * Store-wide policy facts. Single source for the copy blocks, the FAQ, and
   * the `shippingDetails` / `hasMerchantReturnPolicy` nodes in Product schema —
   * so what we advertise, what we render, and what we tell Google agree.
   */
  policy: {
    freeShippingOver: 3300,
    deliveryDaysMin: 2,
    deliveryDaysMax: 5,
    handlingDaysMax: 1,
    returnDays: 3,
    codAvailable: true,
  },
  keywords: [
    'online shopping Pakistan',
    'home essentials Pakistan',
    'kitchen accessories Pakistan',
    'home organization Pakistan',
    'everyday essentials Pakistan',
    'cash on delivery Pakistan',
    'Munasib',
  ],
} as const;

export type SiteConfig = typeof siteConfig;

/** Owned social profiles, in a stable order, with unset entries dropped. */
export function socialProfiles(): string[] {
  return Object.values(siteConfig.social).filter((v): v is string => typeof v === 'string' && !!v);
}
