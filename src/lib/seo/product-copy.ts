/**
 * Product-copy normalisation.
 *
 * The catalog was imported from a supplier/competitor scrape, and the copy
 * arrived carrying that origin: SEO boilerplate written for another shop,
 * city-list spam, template sections, HTML entities, and artifacts left behind
 * by the importer's own brand-scrubbing pass. An audit of all 579 active
 * products found EVERY one carrying at least one defect class.
 *
 * WHY THIS RUNS AT READ TIME, NOT AS A MIGRATION
 *
 * A one-off UPDATE across 579 rows is destructive, unreviewable, and cannot
 * distinguish "supplier junk" from "the only description this product has".
 * Normalising on read is reversible, applies uniformly to rows imported
 * tomorrow, and leaves the source data intact for a human to rewrite properly.
 * `prisma/import-shop-data.ts` is fixed in parallel so new imports are clean at
 * the source; this layer is the safety net for what is already stored.
 *
 * WHAT IT WILL NOT DO
 *
 * Repair, never authorship. Every rule below DELETES an artifact or restores a
 * character the pipeline destroyed. Nothing here invents a specification,
 * material, dimension, capacity, certification, warranty or safety claim — a
 * product whose copy is nothing but boilerplate correctly ends up with an empty
 * description, which the metadata layer then handles with a factual fallback.
 *
 * Re-run `npm run seo:audit-copy` after changing anything here.
 */

/** Named entities seen in the imported copy. `&amp;` MUST decode last. */
const ENTITIES: [RegExp, string][] = [
  [/&nbsp;/gi, ' '],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&#0?39;|&apos;/gi, "'"],
  [/&rsquo;/gi, '’'],
  [/&lsquo;/gi, '‘'],
  [/&ndash;/gi, '–'],
  [/&mdash;/gi, '—'],
  // Last: decoding this first would turn "&amp;lt;" into a real "<".
  [/&amp;/gi, '&'],
];

/** Pakistani cities the scraped "delivery in all major cities" spam lists. */
const PK_CITIES =
  'karachi|lahore|islamabad|rawalpindi|faisalabad|multan|peshawar|quetta|sialkot|gujranwala|hyderabad|sargodha|bahawalpur|sukkur|abbottabad';

type Rule = { id: string; pattern: RegExp; replace: string };

/**
 * Applied in order. Each entry documents the artifact it removes and why that
 * artifact must not reach a shopper or a crawler.
 */
const RULES: Rule[] = [
  // ---- Copy written for the shop this catalog was scraped from -------------
  // "<Shop> has the best prices of X in Pakistan with fast delivery in all
  // major cities … at the lowest price." The importer strips this for the one
  // source it knows about (`smtraders`); three products arrived from other
  // sources ("Wide Traders", a bare "pk") and kept the whole template.
  {
    id: 'source-shop-price-boilerplate',
    pattern:
      /(?:[A-Za-z][\w.'-]*\s+){0,3}has\s+the\s+best\s+prices?\s+of\b[\s\S]*?(?:at\s+the\s+lowest\s+price\b\.?|and\s+many\s+more\s+cities\b[^.]*\.?)/gi,
    replace: ' ',
  },
  // "X prices vary regularly. Please keep on checking our site to find out the
  // latest prices for X." Points the reader at another shop's price page.
  {
    id: 'price-volatility-disclaimer',
    pattern:
      /[^.!?]*\bprices?\s+var(?:y|ies)\s+regularly\b[^.!?]*[.!?]?\s*(?:[^.!?]*\bkeep\s+on\s+checking\b[^.!?]*[.!?]?)?/gi,
    replace: ' ',
  },
  {
    id: 'latest-price-pointer',
    pattern: /[^.!?]*\bfind\s+out\s+the\s+latest\s+price(?:s)?\s+for\b[^.!?]*[.!?]?/gi,
    replace: ' ',
  },
  // The source's price-comparison block, which arrived with its actual figures
  // stripped and reads as nonsense: "Price Refusal The latest price of X … is
  // in, which is less than the cost of X in Pakistan."
  { id: 'price-refusal-heading', pattern: /\bprice\s+refusal\b[\s:.]*/gi, replace: ' ' },
  {
    id: 'price-comparison-sentence',
    pattern: /[^.!?]*\bthe\s+(?:latest|lowest)\s+price\s+of\b[^.!?]*[.!?]?/gi,
    replace: ' ',
  },
  // Any remaining sentence that lists three or more Pakistani cities — the
  // signature of scraped "we deliver everywhere" filler.
  {
    id: 'city-list-sentence',
    pattern: new RegExp(
      String.raw`[^.!?]*\b(?:${PK_CITIES})\b[^.!?]*\b(?:${PK_CITIES})\b[^.!?]*\b(?:${PK_CITIES})\b[^.!?]*[.!?]?`,
      'gi',
    ),
    replace: ' ',
  },
  // A bare "Best Price in Pakistan" stamp left in a heading run.
  {
    id: 'best-price-stamp',
    pattern: /\b(?:best|lowest)\s+price\s+in\s+pakistan\b[.!]?/gi,
    replace: ' ',
  },

  // ---- Claims that are not ours -------------------------------------------
  // "Hassle free 7 days return policy" is the SOURCE shop's policy. Munasib
  // publishes 3 days (siteConfig.policy.returnDays). Serving someone else's
  // returns window on our PDP is a false promise to the customer, so this is
  // removed rather than corrected — the real policy is stated on /shipping.
  {
    id: 'foreign-return-policy',
    pattern: /\bhassle[\s-]*free\s+\d+\s*days?\s+return\s+polic(?:y|ies)\b[.!]?/gi,
    replace: ' ',
  },
  // B2B pricing pitch on a direct-to-consumer storefront. Covers both the bare
  // form and "Get <product name> in wholesale price".
  {
    id: 'wholesale-pitch',
    pattern: /\bget\b(?:\s+[\w&'’/-]+){0,8}?\s+in\s+wholesale\s+price\b[.!]?/gi,
    replace: ' ',
  },
  { id: 'wholesale-bare', pattern: /\bwholesale\s+price(?:\s+available)?\b[.!]?/gi, replace: ' ' },

  // ---- Generic supplier template sections ---------------------------------
  // "Why Buy From Us: High quality … Fast delivery & trusted service". Says
  // nothing about the product, is identical across ~164 products, and is
  // exactly the duplicated boilerplate that suppresses a page in search.
  // Consumes to the end of the copy or to the next recognised section heading.
  // `from you` is not a typo on our side — it is one in the source data, and it
  // is why this block survived the first pass on one product.
  {
    id: 'why-buy-from-us-section',
    pattern:
      /\bwhy\s+buy\s+(?:from\s+(?:us|you)|for\s+this|this)?\s*[?:.]?[\s\S]*?(?=(?:\b(?:specifications?|specs|features?|key\s+features?|use\s+case|benefits?|what'?s\s+in\s+the\s+box|product\s+details?)\b)|$)/gi,
    replace: ' ',
  },

  // ---- Listing-page lead-in -----------------------------------------------
  // "Take a look at <name>" is a category-listing lead-in, not a description.
  // Longest form first. ~247 products carry it, and the 500-char import column
  // truncated many mid-phrase, leaving descriptions as short as "Take a".
  { id: 'take-a-look-at', pattern: /\btake\s+a\s+look\s+at\b[\s:—–-]*/gi, replace: ' ' },
  { id: 'take-a-look', pattern: /\btake\s+a\s+look\b[\s:—–-]*/gi, replace: ' ' },
  { id: 'take-a-remnant', pattern: /^take\s+a?\b[\s:—–-]*$/i, replace: '' },

  // ---- Damage done by the importer's own scrubbing ------------------------
  // The importer deletes the source shop's name wherever it appears, including
  // mid-sentence attributions — "…the Speedy Chopper by smtraders." becomes
  // "…the Speedy Chopper by ." Drop the orphaned preposition with it.
  { id: 'dangling-attribution', pattern: /\s*\b(?:by|from)\s+(?=[.,;:!?])/gi, replace: '' },
  { id: 'dangling-attribution-dash', pattern: /\s*\b(?:by|from)\s+(?=[—–])/gi, replace: ' ' },

  // A heading and the body that followed it were concatenated without their
  // separating newline, welding two words together: "…Quick & Easy Food
  // PrepKitchen Accessories Features:". Restore the boundary.
  {
    id: 'glued-section-heading',
    pattern: /([a-z])(Kitchen Accessories|Home and Living|Home And Living|Kitchen accessories)/g,
    replace: '$1 — $2',
  },
];

/** Punctuation left stranded once a rule removes the text around it. */
const TIDY_INLINE: Rule[] = [
  { id: 'space-after-dash', pattern: /([—–])(\w)/g, replace: '$1 $2' },
  { id: 'orphan-punctuation', pattern: /\s+([.,;:!?])/g, replace: '$1' },
  { id: 'repeated-punctuation', pattern: /([.,;:!?])\1+/g, replace: '$1' },
  { id: 'punctuation-run', pattern: /[.,;:]\s*(?=[.,;:])/g, replace: '' },
  // Stray punctuation at the start of a line, e.g. a rule removing the subject
  // of "…from smtraders. Featuring…" leaves ". Featuring". The optional capture
  // is a markdown bullet / heading / ordered marker, which must SURVIVE — an
  // earlier version of this trim ate the "- " off every bullet on the PDP.
  {
    id: 'leading-punctuation',
    pattern: /^(\s*(?:[-*•]\s+|#{1,6}\s+|\d+[.)]\s+)?)[.,;:!?—–]+\s*/,
    replace: '$1',
  },
  { id: 'trailing-separator', pattern: /[\s,;:—–-]+$/, replace: '' },
];

function applyRules(text: string): string {
  let out = text;
  for (const [pattern, value] of ENTITIES) out = out.replace(pattern, value);
  for (const { pattern, replace } of RULES) out = out.replace(pattern, replace);
  return out;
}

function tidy(text: string): string {
  let out = text;
  for (const { pattern, replace } of TIDY_INLINE) out = out.replace(pattern, replace);
  return out;
}

/**
 * Normalise stored product copy for display or for a meta tag.
 *
 * @param preserveStructure Keep paragraph breaks and markdown, for copy that
 *   goes through `<RichText>` on the product page. Off (the default) flattens
 *   everything to a single plain-text line for a meta tag or a JSON-LD
 *   `description`, where markup would be rendered literally.
 * @returns The cleaned copy, or `''` when only boilerplate was there — callers
 *   must treat that as "no description" and fall back, never render it.
 */
export function normalizeProductCopy(
  input: string | null | undefined,
  { preserveStructure = false }: { preserveStructure?: boolean } = {},
): string {
  if (!input) return '';

  if (!preserveStructure) {
    const flattened = applyRules(
      input
        .replace(/\r\n/g, '\n')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^[-*•]\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1'),
    ).replace(/\s+/g, ' ');
    return tidy(flattened).trim();
  }

  // Line-by-line so headings and bullet lists survive for the RichText renderer.
  const lines = applyRules(input.replace(/\r\n/g, '\n'))
    .split('\n')
    .map((line) => tidy(line.replace(/[ \t]+/g, ' ')).trimEnd());

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Rule ids, for the audit script's per-defect reporting. */
export const COPY_RULE_IDS = RULES.map((r) => r.id);
