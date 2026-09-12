# Munasib — Keyword → URL map

The routing table between search demand and pages. One page owns each cluster;
if two pages could rank for the same cluster, one of them is wrong.

**Scope note.** These are the clusters the current catalog (579 products, 8
categories, 5 guides) can credibly compete for. Volumes are not included —
nobody has run a keyword tool against the live Search Console data yet, and
inventing numbers would be worse than leaving the column out. Validate priority
against Search Console + Keyword Planner before committing budget; the intent
and URL assignments below hold regardless.

**Navigation is not affected by any of this.** SEO landing pages, filtered
collections, and blog clusters are separate concerns from the customer-facing
menu. Nothing in this map adds a level to the header nav.

---

## 1. Brand / entity — `/`

The most important cluster on the site, because it is contested.

| Query                | Intent       | Target URL | Page type |
| -------------------- | ------------ | ---------- | --------- |
| munasib              | Navigational | `/`        | Homepage  |
| munasib pakistan     | Navigational | `/`        | Homepage  |
| munasib.pk           | Navigational | `/`        | Homepage  |
| munasib online store | Navigational | `/`        | Homepage  |
| about munasib        | Navigational | `/about`   | About     |

- **Title:** `Home, Kitchen & Everyday Essentials in Pakistan | Munasib`
- **H1:** `Everything your home runs on.`

---

## 2. Broad commercial — `/` and `/products`

| Query                                     | Intent       | Target URL    | Page type |
| ----------------------------------------- | ------------ | ------------- | --------- |
| home essentials online pakistan           | Commercial   | `/`           | Homepage  |
| online shopping pakistan cash on delivery | Commercial   | `/`           | Homepage  |
| household products online pakistan        | Commercial   | `/products`   | Catalog   |
| everyday essentials pakistan              | Commercial   | `/`           | Homepage  |
| smart home products pakistan              | Commercial   | `/products`   | Catalog   |
| shop by category pakistan                 | Navigational | `/categories` | Hub       |

`/products` title: `All Products — Home, Kitchen & Everyday Essentials in Pakistan | Munasib`

---

## 3. Category clusters

Each category owns one cluster and nothing else. Copy, title, H1 and cross-links
live in `src/config/category-seo.ts` — edit there, not in the page component.

| Primary keyword               | Secondary keywords                                                                                                                                      | Intent     | Target URL                        | Title                                                    | H1                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------- | -------------------------------------------------------- | ----------------------------- |
| kitchen accessories Pakistan  | kitchen gadgets Pakistan · kitchen tools online Pakistan · kitchen organizers Pakistan · vegetable chopper Pakistan · airtight food containers Pakistan | Commercial | `/categories/kitchen-accessories` | Kitchen Accessories Online in Pakistan                   | Kitchen Accessories & Gadgets |
| home essentials Pakistan      | household products online Pakistan · cleaning products Pakistan · home storage racks Pakistan · under sink organizer Pakistan                           | Commercial | `/categories/home-living`         | Home Essentials & Cleaning Products Online in Pakistan   | Home & Living Essentials      |
| wardrobe organizer Pakistan   | storage boxes online Pakistan · magic hangers Pakistan · jewellery organizer box Pakistan · closet organizer price in Pakistan                          | Commercial | `/categories/wardrobe-organizers` | Wardrobe Organizers & Storage Boxes Online in Pakistan   | Wardrobe & Storage Organizers |
| beauty tools Pakistan         | makeup organizer Pakistan · personal care products online Pakistan · hair styler price in Pakistan · grooming kit Pakistan                              | Commercial | `/categories/health-beauty`       | Beauty Tools & Personal Care Products Online in Pakistan | Health & Beauty Essentials    |
| gadgets online Pakistan       | household gadgets Pakistan · multi tool price in Pakistan · portable vacuum cleaner Pakistan · screwdriver set Pakistan                                 | Commercial | `/categories/random-gadgets`      | Smart Gadgets & Household Tools Online in Pakistan       | Useful Gadgets & Multi-Tools  |
| wall decor Pakistan           | wall stickers online Pakistan · home decor items Pakistan · tile stickers Pakistan · led night light Pakistan                                           | Commercial | `/categories/home-wall-decor`     | Wall Decor, Stickers & Home Lighting Online in Pakistan  | Home & Wall Decor             |
| baby products online Pakistan | kids toys Pakistan · baby feeding set Pakistan · lcd writing tablet for kids Pakistan · baby safety products Pakistan                                   | Commercial | `/categories/babies-toys`         | Baby Products & Kids Toys Online in Pakistan             | Baby Essentials & Kids' Toys  |
| mobile accessories Pakistan   | phone holder price in Pakistan · car mobile mount Pakistan · waterproof phone pouch Pakistan                                                            | Commercial | `/categories/mobile-accessories`  | Mobile Accessories & Phone Holders Online in Pakistan    | Mobile Accessories            |

> **Mobile Accessories is currently `noindex, follow`** — it holds 3 products,
> below the `MIN_INDEXABLE_PRODUCTS` threshold (8). It stays live, linked, and
> shoppable; it re-enters the index automatically once inventory reaches the
> threshold. Do not chase this cluster until then.

---

## 4. Product / transactional

Generated per product by `generateProductMetadata()` — never hand-written per
PDP. The pattern:

| Condition                           | Title pattern                         | Example                                                                  |
| ----------------------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| Product name ≤ ~34 chars            | `<name> Price in Pakistan \| Munasib` | `Water Bottle Lifter Price in Pakistan \| Munasib`                       |
| Longer descriptive name             | `<name> \| Munasib`                   | `Cute Heart-Shaped Jewellery Box — Velvet Interior Organizer \| Munasib` |
| `products.seo_title` set and ≠ name | override used verbatim                | merchandiser's choice                                                    |

The price modifier lands on ~6% of the catalog (32 of 579). The length test is a
proxy for intent: short names in this catalog are the generic product types
people price-shop ("Fridge Drawer Basket", "Child Safety Lock"), while long ones
already carry their own long-tail. To force the modifier onto a specific
product, set `products.seo_title` in the admin.

Representative transactional targets:

| Query                                | Intent        | Target URL                                                            |
| ------------------------------------ | ------------- | --------------------------------------------------------------------- |
| speedy chopper price in pakistan     | Transactional | `/products/handpull-string-manual-speedy-vegetable-chopper`           |
| magic hanger price in pakistan       | Transactional | `/products/3piece-9hole-magic-clothes-hanger`                         |
| rice dispenser pakistan              | Transactional | `/products/10kg-airtight-rice-dispenser-container-cereal-storage-box` |
| lcd writing tablet for kids pakistan | Transactional | `/products/12inch-kids-lcd-erasable-writing-tablet-and-drawing-board` |
| faucet aerator pakistan              | Transactional | `/products/360-rotating-faucet-water-aerator-splashproof-nozzle`      |

---

## 5. Informational — blog clusters

Guides exist to capture informational demand and route it to a commercial page.
Every guide links to its categories via `CATEGORY_SEO.guides`, and the "Shop
this guide" block on the post is generated from the inverse of that mapping, so
the two directions cannot drift.

| Query                       | Intent        | Target URL                               | Funnels to                         |
| --------------------------- | ------------- | ---------------------------------------- | ---------------------------------- |
| kitchen organization ideas  | Informational | `/blog/kitchen-cabinet-organizing-guide` | Kitchen Accessories, Home & Living |
| small closet storage ideas  | Informational | `/blog/small-closet-multi-hole-hangers`  | Wardrobe & Organizers              |
| what is a faucet aerator    | Informational | `/blog/faucet-aerator-guide`             | Kitchen Accessories, Home & Living |
| cable management ideas home | Informational | `/blog/cable-management-home-guide`      | Mobile Accessories, Home & Living  |
| vertical wall storage ideas | Informational | `/blog/vertical-wall-storage-guide`      | Home & Wall Decor, Wardrobe        |

### Gaps worth writing next

Ordered by how directly they support a category that already has inventory.
Each should be one article linking to one primary category — **do not mix
unrelated topics in one post to spread links**.

1. `best vegetable chopper in pakistan` → Kitchen Accessories (commercial-informational; the highest-intent gap)
2. `manual vs electric chopper` → Kitchen Accessories
3. `how to organize a small kitchen in pakistan` → Kitchen Accessories + Home & Living
4. `best kitchen gadgets in pakistan` → Kitchen Accessories + Random Gadgets
5. `baby feeding essentials checklist` → Babies & Toys
6. `how to childproof your home` → Babies & Toys (safety corner protectors, locks)
7. `is cash on delivery safe when shopping online in pakistan` → trust/brand, links to `/shipping` and `/about`

---

## 6. Trust / support (no ranking target, high conversion value)

`/about`, `/contact`, `/shipping`, `/faq`, `/privacy`, `/terms`,
`/accessibility` — indexable, in the sitemap, linked sitewide from the footer.
They exist for E-E-A-T and for the shopper deciding whether to trust a
cash-on-delivery order, not for traffic. `/about` and `/contact` carry
`AboutPage` / `ContactPage` schema.

---

## 7. Deliberately not targeted

| URL                              | Status                         | Why                                                                                                                                                        |
| -------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/search`                        | `noindex` + robots disallow    | Infinite thin permutations competing with curated categories                                                                                               |
| `/cart`, `/checkout`             | `noindex` + robots disallow    | Transactional funnel, no search value                                                                                                                      |
| `/brands/munasib`                | `noindex, follow`              | Single own-label brand ⇒ byte-for-byte duplicate of `/products`. Lifts automatically at 2+ brands                                                          |
| `/categories/mobile-accessories` | `noindex, follow`              | Below the 8-product indexability threshold                                                                                                                 |
| `/categories/uncategorized`      | Not linked, not in sitemap     | Holding pen for unclassified imports                                                                                                                       |
| `/ai-skincare-assistant`         | `noindex`                      | Orphan route from the cosmetics storefront this was forked from. A skincare URL dilutes topical relevance — retire it once the quiz flow is decommissioned |
| `?sort=`, `?brand=`, `?utm_*`    | Canonicalised to the clean URL | Faceted duplicates                                                                                                                                         |
| `?page=2..n`                     | Self-referencing canonical     | Deeper listings must stay crawlable, so they are NOT folded onto page 1                                                                                    |
