# SEO Setup — Search Console, Bing & Google Merchant Center

The code already emits a sitemap (`/sitemap.xml`), robots rules (`/robots.txt`),
canonical URLs, Open Graph/Twitter cards, and JSON-LD (Organization, WebSite,
Product, Article, FAQ, Breadcrumb). What's left is **registering the site with
search engines and the shopping feed** — dashboard work only you can do.

---

## 1. Google Search Console (do this first)

Search Console is how Google reports indexing, impressions, clicks, queries and
errors. Free.

1. Go to <https://search.google.com/search-console> and **Add property**.
2. Choose **Domain** (covers http/https + all subdomains) — recommended — and
   add the **DNS TXT record** it gives you at your domain registrar/DNS.
   - If you can't edit DNS, use the **URL-prefix** property with
     `https://munasib.pk` and verify via the **HTML tag** method (see the
     note below on adding it in code) or the Vercel domain integration.
3. Once verified, open **Sitemaps** → submit `sitemap.xml`.
4. Use **URL Inspection** on your homepage and a product page → **Request
   indexing** to prime the first crawl.
5. Check back over the next 1–2 weeks: **Pages** (coverage), **Performance**
   (queries/clicks), and **Enhancements** (it will validate your Product / FAQ /
   Breadcrumb rich results).

**Adding the HTML verification tag in code (only if you use the URL-prefix +
HTML-tag method):** set the value in the site metadata's `verification` field.
Ask and I'll wire `verification: { google: '<token>' }` into `buildMetadata`.

---

## 2. Bing Webmaster Tools (5 minutes, optional but worth it)

1. Go to <https://www.bing.com/webmasters> → **Import from Google Search
   Console** (one click once GSC is set up), or add + verify manually.
2. Submit `sitemap.xml`. Bing also powers DuckDuckGo/ChatGPT search surfaces.

---

## 3. Google Merchant Center → free Google Shopping listings

Google Merchant Center gets you **free product listings on the Shopping tab**
(and, if you ever run Google Ads, Shopping/Performance Max campaigns).

There are three product feeds, all live and serving the full 579-product
catalog. Use the **Google** one here — it is already in Google's RSS format:

| Feed               | Route                       | Used by                 |
| ------------------ | --------------------------- | ----------------------- |
| Google Merchant    | `/feed/google-merchant.xml` | Merchant Center         |
| Meta catalog (RSS) | `/feed/meta-catalog.xml`    | Meta Commerce Manager   |
| Meta catalog (CSV) | `/api/catalog`              | Meta, legacy CSV import |

1. Create an account at <https://merchants.google.com>.
2. **Business info** → add your business name, country (Pakistan), and contact.
3. **Verify and claim your website** — Merchant Center will reuse the same
   Search Console verification, so do step 1 first.
4. **Products → Feeds → Add a primary feed**:
   - Country: Pakistan · Language: English
   - Method: **Scheduled fetch**
   - Feed URL: `https://munasib.pk/feed/google-merchant.xml`
   - Set a daily fetch time.
5. Fill in the **required shopping policies** (return policy, shipping) under
   Merchant Center settings — Google needs these before listings go live.

### Feed field coverage

`/feed/google-merchant.xml` already emits everything Merchant Center requires:
`g:id`, `title`, `description`, `link`, `g:image_link`, `g:additional_image_link`,
`g:availability`, `g:price`, `g:sale_price`, `g:brand`, `g:condition`,
`g:identifier_exists`, `g:google_product_category` and `g:product_type`.
Products carry no GTIN/MPN, which is legitimate for unbranded goods — the feed
declares `identifier_exists: no` so Google accepts them.

> **Before submitting:** every product's `g:brand` currently reads
> **"Elviora Home"** — the single brand row all 579 products point at, carried
> over from the fork. Merchant Center matches and groups products by brand, so
> rename that brand row to "Munasib" (Admin → Brands) before the first fetch.

> **Also:** `link` and `g:image_link` are built from `NEXT_PUBLIC_SITE_URL`. If
> that is not set to `https://munasib.pk` in Vercel, every feed URL points
> somewhere useless and Merchant Center will reject the whole feed.

---

## 4. Google Business Profile (local SEO, Pakistan)

If Munasib has a physical presence or serves a local area, create a **Google
Business Profile** at <https://business.google.com>. It powers the Maps/local
pack and a branded knowledge panel — high intent, low effort. Use the same
business name, the Islamabad address from `siteConfig.shippingFrom` (if public),
and link back to the site.

---

## Verifying the technical SEO is working

- **Rich results:** paste a product URL and a blog URL into
  <https://search.google.com/test/rich-results> — it should detect Product /
  Offer / AggregateRating, BlogPosting, and (on `/faq`) FAQPage.
- **Share previews:** paste any page URL into
  <https://developers.facebook.com/tools/debug/> (Sharing Debugger) and the
  Twitter/X card validator — the branded Open Graph card (or the product photo
  on product pages) should render. Use "Scrape Again" after deploys to refresh
  Facebook's cache.
- **Sitemap health:** `https://munasib.pk/sitemap.xml` should list your
  products, categories, brands and posts.
